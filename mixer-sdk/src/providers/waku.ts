import { createLightNode, waitForRemotePeer, createEncoder, createDecoder, Protocols, type LightNode } from '@waku/sdk';
import protobuf from 'protobufjs';

const CONTENT_TOPIC = '/ckb-mixer/1/relay/proto';
const ROUTING_INFO = { clusterId: 0, shardId: 0, pubsubTopic: '/waku/2/default-waku/proto' };

export const encoder = createEncoder({ contentTopic: CONTENT_TOPIC, routingInfo: ROUTING_INFO });
export const decoder = createDecoder(CONTENT_TOPIC, ROUTING_INFO);

export const RelayMessage = new protobuf.Type('RelayMessage')
    .add(new protobuf.Field('type', 1, 'string'))
    .add(new protobuf.Field('payload', 2, 'string'));

export async function initWaku() {
    const waku = await createLightNode({ defaultBootstrap: true });
    await waku.start();
    await waitForRemotePeer(waku, [Protocols.LightPush, Protocols.Filter]);
    return waku;
}

export async function publishWakuMessage(waku: LightNode, type: string, payload: unknown) {
    const message = RelayMessage.create({ type, payload: JSON.stringify(payload) });
    const serialized = RelayMessage.encode(message).finish();
    
    await waku.lightPush.send(encoder, {
        payload: serialized,
    });
}

export async function subscribeToWakuMessages(
    waku: LightNode,
    typeFilter: string,
    callback: (payload: any) => void
) {
    await waku.filter.subscribe([decoder], (wakuMessage) => {
        if (!wakuMessage.payload) return;
        
        try {
            const decoded = RelayMessage.decode(wakuMessage.payload) as any;
            if (decoded.type === typeFilter) {
                const payload = JSON.parse(decoded.payload);
                callback(payload);
            }
        } catch (e) {
            console.error('Failed to decode Waku message', e);
        }
    });
}
