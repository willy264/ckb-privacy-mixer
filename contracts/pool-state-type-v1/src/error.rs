use ckb_std::error::SysError;

#[repr(i8)]
pub enum Error {
    IndexOutOfBound = 1,
    ItemMissing = 2,
    LengthNotEnough = 3,
    Encoding = 4,
    InvalidArgs = 5,
    InvalidCellCount = 6,
    InvalidStateEncoding = 7,
    InvalidVersion = 8,
    InvalidPoolIdentity = 9,
    InvalidAsset = 10,
    InvalidDenomination = 11,
    InvalidConfig = 12,
    NonCanonicalField = 13,
    InvalidAccounting = 14,
    InvalidGenesis = 15,
    InvalidSequence = 16,
    InvalidRootTransition = 17,
    InvalidVault = 18,
    InvalidStaging = 19,
    UnsupportedTransition = 20,
    InvalidCellShape = 21,
    InvalidStagingOrder = 22,
    InvalidTypeId = 23,
    UnsupportedInitialization = 24,
}

impl From<SysError> for Error {
    fn from(error: SysError) -> Self {
        match error {
            SysError::IndexOutOfBound => Self::IndexOutOfBound,
            SysError::ItemMissing => Self::ItemMissing,
            SysError::LengthNotEnough(_) => Self::LengthNotEnough,
            SysError::Encoding => Self::Encoding,
            SysError::TypeIDError => Self::InvalidTypeId,
            SysError::Unknown(code) => panic!("unexpected syscall error {code}"),
            _ => panic!("unexpected spawn syscall error"),
        }
    }
}
