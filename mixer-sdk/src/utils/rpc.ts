export interface JsonRpcRequest {
    id: number;
    jsonrpc: '2.0';
    method: string;
    params: unknown[];
}

export interface JsonRpcSuccess<T> {
    id: number;
    jsonrpc: '2.0';
    result: T;
}

export interface JsonRpcFailure {
    id: number;
    jsonrpc: '2.0';
    error: {
        code: number;
        message: string;
    };
}

export type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcFailure;

export async function callJsonRpc<T>(
    url: string,
    method: string,
    params: unknown[],
): Promise<T> {
    const request: JsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0',
        method,
        params,
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        throw new Error(`JSON-RPC request failed (${response.status} ${response.statusText})`);
    }

    const payload = (await response.json()) as JsonRpcResponse<T>;
    if ('error' in payload) {
        throw new Error(`JSON-RPC ${method} failed: ${payload.error.message}`);
    }

    return payload.result;
}
