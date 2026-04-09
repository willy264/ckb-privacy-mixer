use ckb_std::error::SysError;

#[repr(i8)]
pub enum Error {
    InvalidDenomination = 1,
    ItemMissing = 2,
    InsufficientParticipants = 3,
    InvalidOutputLock = 4,
    LengthNotEnough = 5,
    InputOutputMismatch = 6,
    IndexOutOfBound = 7,
    Encoding = 8,
    CommitmentVerificationFailed = 9,
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
