use ckb_std::error::SysError;

#[repr(i8)]
pub enum Error {
    IndexOutOfBound = 1,
    ItemMissing = 2,
    LengthNotEnough = 3,
    Encoding = 4,
    InvalidRegistryData = 5,
    InvalidCellCount = 6,
    InvalidRegistryUpdate = 7,
    NullifierAlreadyUsed = 8,
    NonEmptyInitRegistry = 9,
}

impl From<SysError> for Error {
    fn from(err: SysError) -> Self {
        match err {
            SysError::IndexOutOfBound => Self::IndexOutOfBound,
            SysError::ItemMissing => Self::ItemMissing,
            SysError::LengthNotEnough(_) => Self::LengthNotEnough,
            SysError::Encoding => Self::Encoding,
            SysError::Unknown(err_code) => panic!("unexpected sys error {}", err_code),
            _ => panic!("unreachable spawn related sys error"),
        }
    }
}
