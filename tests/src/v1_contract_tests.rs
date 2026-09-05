use super::Loader;
use ckb_hash::new_blake2b;
use ckb_testtool::{
    builtin::ALWAYS_SUCCESS,
    ckb_types::{
        bytes::Bytes,
        core::{TransactionBuilder, TransactionView},
        packed::{CellInput, CellOutput, OutPoint, Script},
        prelude::*,
    },
    context::Context,
};
use obscell_v1_types::{
    Byte32, PoolConfigV1, PoolStateV1, PoolTypeArgsV1, ScriptCodeRefV1, StagingCellDataV1,
    StagingDepositV1, StagingLockArgsV1, TREE_DEPTH, VERSION, VaultLockArgsV1,
};

const CELL_CAPACITY: u64 = 200_000_000_000;
const REFUND_RESERVE: u64 = 100_000_000_000;
const DENOMINATION: u128 = 100;
const RELATIVE_BLOCKS: u64 = 0x8000_0000_0000_000a;
const MAX_CYCLES: u64 = 50_000_000;

struct Deployed {
    pool_dep: OutPoint,
    vault_dep: OutPoint,
    staging_dep: OutPoint,
    vault_code: ScriptCodeRefV1,
    staging_code: ScriptCodeRefV1,
    asset: Script,
    alternate_asset: Script,
    base_lock: Script,
    refund_lock: Script,
}

#[derive(Clone, Copy)]
enum GenesisMutation {
    None,
    WrongPool,
    ZeroDenomination,
    WrongVaultAsset,
    NonzeroVault,
    NoncanonicalRoot,
}

#[derive(Clone, Copy)]
enum AcceptanceMutation {
    None,
    WrongPool,
    WrongAsset,
    WrongDenomination,
    WrongSequence,
    WrongRootHistory,
    UnchangedVault,
    Withdrawal,
}

#[derive(Clone, Copy)]
enum RefundMutation {
    None,
    TooEarly,
    WrongRecipient,
    WrongAsset,
    ChangedCommitment,
    InsufficientReserve,
}

fn deploy(context: &mut Context) -> Deployed {
    let loader = Loader::default();
    let pool_dep = context.deploy_cell(loader.load_binary("pool-state-type-v1"));
    let vault_dep = context.deploy_cell(loader.load_binary("vault-lock-v1"));
    let staging_dep = context.deploy_cell(loader.load_binary("staging-lock-v1"));
    let always_dep = context.deploy_cell(ALWAYS_SUCCESS.clone());

    let vault_code = code_ref(
        &context
            .build_script(&vault_dep, Bytes::new())
            .expect("vault code script"),
    );
    let staging_code = code_ref(
        &context
            .build_script(&staging_dep, Bytes::new())
            .expect("staging code script"),
    );
    let asset = context
        .build_script(&always_dep, Bytes::from(vec![0xa1]))
        .expect("asset script");
    let alternate_asset = context
        .build_script(&always_dep, Bytes::from(vec![0xa2]))
        .expect("alternate asset script");
    let base_lock = context
        .build_script(&always_dep, Bytes::from(vec![0xb1]))
        .expect("base lock");
    let refund_lock = context
        .build_script(&always_dep, Bytes::from(vec![0xb2]))
        .expect("refund lock");

    Deployed {
        pool_dep,
        vault_dep,
        staging_dep,
        vault_code,
        staging_code,
        asset,
        alternate_asset,
        base_lock,
        refund_lock,
    }
}

fn code_ref(script: &Script) -> ScriptCodeRefV1 {
    ScriptCodeRefV1 {
        code_hash: byte32(script.code_hash().raw_data().as_ref()),
        hash_type: u8::from(script.hash_type()),
    }
}

fn script_hash(script: &Script) -> Byte32 {
    byte32(script.calc_script_hash().raw_data().as_ref())
}

fn byte32(data: &[u8]) -> Byte32 {
    data.try_into().expect("32 bytes")
}

fn type_id(first_input: &CellInput, output_index: u64) -> Byte32 {
    let mut hasher = new_blake2b();
    hasher.update(first_input.as_slice());
    hasher.update(&output_index.to_le_bytes());
    let mut result = [0u8; 32];
    hasher.finalize(&mut result);
    result
}

fn pool_script(context: &mut Context, deployed: &Deployed, pool_id: Byte32) -> Script {
    let args = PoolTypeArgsV1 {
        version: VERSION,
        type_id: pool_id,
        vault_lock: deployed.vault_code,
        staging_lock: deployed.staging_code,
    };
    context
        .build_script(&deployed.pool_dep, Bytes::copy_from_slice(&args.to_bytes()))
        .expect("pool script")
}

fn vault_script(
    context: &mut Context,
    deployed: &Deployed,
    pool_id: Byte32,
    pool_type_hash: Byte32,
    asset_id: Byte32,
) -> Script {
    let args = VaultLockArgsV1 {
        version: VERSION,
        pool_id,
        pool_type_hash,
        asset_id,
        denomination: DENOMINATION,
    };
    context
        .build_script(
            &deployed.vault_dep,
            Bytes::copy_from_slice(&args.to_bytes()),
        )
        .expect("vault script")
}

fn staging_script(
    context: &mut Context,
    deployed: &Deployed,
    pool_id: Byte32,
    pool_type_hash: Byte32,
) -> Script {
    let args = StagingLockArgsV1 {
        version: VERSION,
        pool_id,
        pool_type_hash,
    };
    context
        .build_script(
            &deployed.staging_dep,
            Bytes::copy_from_slice(&args.to_bytes()),
        )
        .expect("staging script")
}

fn cell(lock: Script, type_script: Option<Script>, capacity: u64) -> CellOutput {
    CellOutput::new_builder()
        .capacity(capacity)
        .lock(lock)
        .type_(type_script.pack())
        .build()
}

fn state(pool_id: Byte32, asset_id: Byte32) -> PoolStateV1 {
    PoolStateV1 {
        config: PoolConfigV1 {
            version: VERSION,
            pool_id,
            asset_id,
            denomination: DENOMINATION,
            tree_depth: TREE_DEPTH,
            root_history_size: 4,
            reserved: 0,
        },
        sequence: 0,
        commitment_root: [1; 32],
        nullifier_root: [0; 32],
        next_leaf_index: 0,
        outstanding_count: 0,
        outstanding_value: 0,
        frontier: vec![[0; 32]; TREE_DEPTH as usize],
        accepted_roots: vec![[1; 32]],
    }
}

fn build_genesis(mutation: GenesisMutation) -> (Context, TransactionView) {
    let mut context = Context::default();
    let deployed = deploy(&mut context);
    let seed_output = cell(deployed.base_lock.clone(), None, CELL_CAPACITY * 2);
    let seed_outpoint = context.create_cell(seed_output, Bytes::new());
    let seed_input = CellInput::new_builder()
        .previous_output(seed_outpoint)
        .build();
    let pool_id = type_id(&seed_input, 0);
    let pool = pool_script(&mut context, &deployed, pool_id);
    let pool_type_hash = script_hash(&pool);
    let asset_id = script_hash(&deployed.asset);
    let vault = vault_script(&mut context, &deployed, pool_id, pool_type_hash, asset_id);
    let mut pool_state = state(pool_id, asset_id);
    let mut vault_data = [0u8; 32];
    let mut vault_asset = deployed.asset.clone();

    match mutation {
        GenesisMutation::None => {}
        GenesisMutation::WrongPool => pool_state.config.pool_id = [0x91; 32],
        GenesisMutation::ZeroDenomination => pool_state.config.denomination = 0,
        GenesisMutation::WrongVaultAsset => vault_asset = deployed.alternate_asset.clone(),
        GenesisMutation::NonzeroVault => vault_data = [0x92; 32],
        GenesisMutation::NoncanonicalRoot => {
            pool_state.commitment_root = [0xff; 32];
            pool_state.accepted_roots = vec![[0xff; 32]];
        }
    }

    let tx = TransactionBuilder::default()
        .inputs(vec![seed_input])
        .outputs(vec![
            cell(deployed.base_lock.clone(), Some(pool), CELL_CAPACITY),
            cell(vault, Some(vault_asset), CELL_CAPACITY),
        ])
        .outputs_data(vec![
            Bytes::from(pool_state.to_bytes()).pack(),
            Bytes::copy_from_slice(&vault_data).pack(),
        ])
        .build();
    let tx = context.complete_tx(tx);
    (context, tx)
}

fn build_acceptance(mutation: AcceptanceMutation) -> (Context, TransactionView) {
    let mut context = Context::default();
    let deployed = deploy(&mut context);
    let pool_id = [0x11; 32];
    let pool = pool_script(&mut context, &deployed, pool_id);
    let pool_type_hash = script_hash(&pool);
    let asset_id = script_hash(&deployed.asset);
    let vault = vault_script(&mut context, &deployed, pool_id, pool_type_hash, asset_id);
    let staging_lock = staging_script(&mut context, &deployed, pool_id, pool_type_hash);
    let mut old = state(pool_id, asset_id);
    let mut new = old.clone();
    new.sequence = 1;
    new.next_leaf_index = 1;
    new.outstanding_count = 1;
    new.outstanding_value = DENOMINATION;
    new.commitment_root = [2; 32];
    new.frontier[0] = [3; 32];
    new.accepted_roots.push([2; 32]);

    let mut deposit = StagingDepositV1 {
        version: VERSION,
        pool_id,
        asset_id,
        denomination: DENOMINATION,
        commitment: [4; 32],
        refund_lock_hash: script_hash(&deployed.refund_lock),
        refund_since: RELATIVE_BLOCKS,
        capacity_reserve: REFUND_RESERVE,
    };
    let old_vault_data = [0u8; 32];
    let mut new_vault_data = [6u8; 32];
    let include_staging = !matches!(mutation, AcceptanceMutation::Withdrawal);

    match mutation {
        AcceptanceMutation::None => {}
        AcceptanceMutation::WrongPool => deposit.pool_id = [0x51; 32],
        AcceptanceMutation::WrongAsset => deposit.asset_id = [0x52; 32],
        AcceptanceMutation::WrongDenomination => deposit.denomination += 1,
        AcceptanceMutation::WrongSequence => new.sequence = 2,
        AcceptanceMutation::WrongRootHistory => new.accepted_roots = vec![[2; 32]],
        AcceptanceMutation::UnchangedVault => new_vault_data = old_vault_data,
        AcceptanceMutation::Withdrawal => {
            old.sequence = 1;
            old.next_leaf_index = 1;
            old.outstanding_count = 1;
            old.outstanding_value = DENOMINATION;
            old.frontier[0] = [3; 32];
            new = old.clone();
            new.sequence = 2;
            new.outstanding_count = 0;
            new.outstanding_value = 0;
            new.nullifier_root = [7; 32];
        }
    }

    let pool_input = context.create_cell(
        cell(
            deployed.base_lock.clone(),
            Some(pool.clone()),
            CELL_CAPACITY,
        ),
        Bytes::from(old.to_bytes()),
    );
    let vault_input = context.create_cell(
        cell(vault.clone(), Some(deployed.asset.clone()), CELL_CAPACITY),
        Bytes::copy_from_slice(&old_vault_data),
    );
    let mut inputs = vec![
        CellInput::new_builder().previous_output(pool_input).build(),
        CellInput::new_builder()
            .previous_output(vault_input)
            .build(),
    ];
    if include_staging {
        let staging_data = StagingCellDataV1 {
            ct_commitment: [5; 32],
            deposit,
        }
        .to_bytes();
        let staging_input = context.create_cell(
            cell(staging_lock, Some(deployed.asset.clone()), CELL_CAPACITY),
            Bytes::from(staging_data),
        );
        inputs.push(
            CellInput::new_builder()
                .previous_output(staging_input)
                .build(),
        );
    }

    let tx = TransactionBuilder::default()
        .inputs(inputs)
        .outputs(vec![
            cell(deployed.base_lock, Some(pool), CELL_CAPACITY),
            cell(
                vault,
                Some(deployed.asset),
                if include_staging {
                    CELL_CAPACITY * 2
                } else {
                    CELL_CAPACITY
                },
            ),
        ])
        .outputs_data(vec![
            Bytes::from(new.to_bytes()).pack(),
            Bytes::copy_from_slice(&new_vault_data).pack(),
        ])
        .build();
    let tx = context.complete_tx(tx);
    (context, tx)
}

fn build_refund(mutation: RefundMutation) -> (Context, TransactionView) {
    let mut context = Context::default();
    let deployed = deploy(&mut context);
    let pool_id = [0x31; 32];
    let pool_type_hash = [0x32; 32];
    let asset_id = script_hash(&deployed.asset);
    let staging_lock = staging_script(&mut context, &deployed, pool_id, pool_type_hash);
    let ct_commitment = [0x41; 32];
    let deposit = StagingDepositV1 {
        version: VERSION,
        pool_id,
        asset_id,
        denomination: DENOMINATION,
        commitment: [0x04; 32],
        refund_lock_hash: script_hash(&deployed.refund_lock),
        refund_since: RELATIVE_BLOCKS,
        capacity_reserve: REFUND_RESERVE,
    };
    let staging_data = StagingCellDataV1 {
        ct_commitment,
        deposit,
    }
    .to_bytes();
    let staging_outpoint = context.create_cell(
        cell(staging_lock, Some(deployed.asset.clone()), CELL_CAPACITY),
        Bytes::from(staging_data),
    );

    let mut since = RELATIVE_BLOCKS;
    let mut output_lock = deployed.refund_lock;
    let mut output_asset = deployed.asset;
    let mut output_commitment = ct_commitment;
    let mut output_capacity = CELL_CAPACITY;
    match mutation {
        RefundMutation::None => {}
        RefundMutation::TooEarly => since = 0x8000_0000_0000_0009,
        RefundMutation::WrongRecipient => output_lock = deployed.base_lock,
        RefundMutation::WrongAsset => output_asset = deployed.alternate_asset,
        RefundMutation::ChangedCommitment => output_commitment = [0x43; 32],
        RefundMutation::InsufficientReserve => output_capacity = REFUND_RESERVE - 1,
    }

    let input = CellInput::new_builder()
        .previous_output(staging_outpoint)
        .since(since)
        .build();
    let tx = TransactionBuilder::default()
        .inputs(vec![input])
        .outputs(vec![cell(output_lock, Some(output_asset), output_capacity)])
        .outputs_data(vec![Bytes::copy_from_slice(&output_commitment).pack()])
        .build();
    let tx = context.complete_tx(tx);
    (context, tx)
}

fn verify(context: &Context, tx: &TransactionView) -> Result<u64, ckb_testtool::ckb_error::Error> {
    context.verify_tx(tx, MAX_CYCLES)
}

fn assert_rejected(context: Context, tx: TransactionView) {
    let error = verify(&context, &tx).expect_err("transaction must be rejected");
    let rendered = format!("{error:?}");
    assert!(
        rendered.contains("ValidationFailure"),
        "unexpected error: {rendered}"
    );
}

fn assert_script_error(context: Context, tx: TransactionView, code: i8) {
    let error = verify(&context, &tx).expect_err("transaction must be rejected");
    let rendered = format!("{error:?}");
    assert!(
        rendered.contains(&format!("error code {code}"))
            || rendered.contains(&format!("ValidationFailure(\"Byte({code})\")")),
        "expected script error {code}, got {rendered}"
    );
}

#[test]
fn pool_genesis_fails_closed_until_empty_root_is_derived() {
    let (context, tx) = build_genesis(GenesisMutation::None);
    assert_script_error(context, tx, 24);
}

#[test]
fn pool_genesis_rejects_wrong_pool_id() {
    let (context, tx) = build_genesis(GenesisMutation::WrongPool);
    assert_script_error(context, tx, 9);
}

#[test]
fn pool_genesis_rejects_zero_denomination() {
    let (context, tx) = build_genesis(GenesisMutation::ZeroDenomination);
    assert_script_error(context, tx, 11);
}

#[test]
fn pool_genesis_rejects_wrong_vault_asset() {
    let (context, tx) = build_genesis(GenesisMutation::WrongVaultAsset);
    assert_rejected(context, tx);
}

#[test]
fn pool_genesis_rejects_nonzero_vault_commitment() {
    let (context, tx) = build_genesis(GenesisMutation::NonzeroVault);
    assert_script_error(context, tx, 18);
}

#[test]
fn pool_genesis_rejects_noncanonical_empty_root() {
    let (context, tx) = build_genesis(GenesisMutation::NoncanonicalRoot);
    assert_script_error(context, tx, 13);
}

#[test]
fn pool_acceptance_rejects_unverified_arbitrary_root_and_frontier() {
    let (context, tx) = build_acceptance(AcceptanceMutation::None);
    assert_script_error(context, tx, 20);
}

#[test]
fn pool_acceptance_rejects_wrong_staging_pool() {
    let (context, tx) = build_acceptance(AcceptanceMutation::WrongPool);
    assert_rejected(context, tx);
}

#[test]
fn pool_acceptance_rejects_wrong_staging_asset() {
    let (context, tx) = build_acceptance(AcceptanceMutation::WrongAsset);
    assert_rejected(context, tx);
}

#[test]
fn pool_acceptance_rejects_wrong_staging_denomination() {
    let (context, tx) = build_acceptance(AcceptanceMutation::WrongDenomination);
    assert_rejected(context, tx);
}

#[test]
fn pool_acceptance_rejects_skipped_sequence() {
    let (context, tx) = build_acceptance(AcceptanceMutation::WrongSequence);
    assert_rejected(context, tx);
}

#[test]
fn pool_acceptance_rejects_invalid_root_history_shift() {
    let (context, tx) = build_acceptance(AcceptanceMutation::WrongRootHistory);
    assert_rejected(context, tx);
}

#[test]
fn pool_acceptance_rejects_unchanged_vault_commitment() {
    let (context, tx) = build_acceptance(AcceptanceMutation::UnchangedVault);
    assert_rejected(context, tx);
}

#[test]
fn pool_withdrawal_transition_is_explicitly_unsupported() {
    let (context, tx) = build_acceptance(AcceptanceMutation::Withdrawal);
    assert_rejected(context, tx);
}

#[test]
fn staging_refund_structural_path_succeeds_with_placeholder_asset_type() {
    let (context, tx) = build_refund(RefundMutation::None);
    verify(&context, &tx).expect("structurally valid refund");
}

#[test]
fn staging_refund_rejects_early_since() {
    let (context, tx) = build_refund(RefundMutation::TooEarly);
    assert_script_error(context, tx, 11);
}

#[test]
fn staging_refund_rejects_changed_recipient() {
    let (context, tx) = build_refund(RefundMutation::WrongRecipient);
    assert_script_error(context, tx, 12);
}

#[test]
fn staging_refund_rejects_changed_asset() {
    let (context, tx) = build_refund(RefundMutation::WrongAsset);
    assert_rejected(context, tx);
}

#[test]
fn staging_refund_rejects_changed_ct_commitment() {
    let (context, tx) = build_refund(RefundMutation::ChangedCommitment);
    assert_script_error(context, tx, 13);
}

#[test]
fn staging_refund_rejects_capacity_below_reserve() {
    let (context, tx) = build_refund(RefundMutation::InsufficientReserve);
    assert_script_error(context, tx, 13);
}
