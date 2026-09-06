# Legacy Artifact Inventory

SHA-256 values audited on 2026-09-04:

| File | SHA-256 |
|---|---|
| `circuits/mixer.circom` | `C6F759A974F3D2BC164C84E97CC3A0B5007B15C8D34EC461472DA62693DD946C` |
| `circuits/mixer_final.zkey` | `5FA5D370BB9A65EEA42F5096B01FC758BEE76E05E9F18DA9F8379B475BD44892` |
| `circuits/mixer_js/mixer.wasm` | `5D9818C2F087779A462C8324647F2D9F08EEACDBCD9732622E7C611B4635ED6F` |
| `circuits/verification_key.json` | `5963B48430DAB33F0442F28DBE45D04728685E9E611935E010DE833F38818312` |
| `circuits/proof.json` | `B7FE3CBDCC86BC1B80FAEEA4947D79DFDFE2D4C2469611D8C840B3CB0B202F61` |
| `circuits/public.json` | `8DDD36BFA16783278D41707E2CB0CFAEBB6E61A1DEC0CEFB64754D389F9CC4AC` |

These artifacts correspond to the legacy three-public-input circuit (`root`, `nullifierHash`, `recipient`). They are invalid for corrected V1.

The legacy zkey verifies against the local R1CS and Powers of Tau files present in the audited working copy, but the R1CS, symbol, input, Powers of Tau, and intermediate zkey files are not tracked. A clean clone therefore cannot reproduce the ceremony/artifacts. This inventory preserves evidence; it is not a reproducible release or trusted-setup attestation.
