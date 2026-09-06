use ckb_std::error::SysError;

#[repr(i8)]
pub enum Error {
    IndexOutOfBound = 1,
    ItemMissing = 2,
    LengthNotEnough = 3,
    Encoding = 4,
    InvalidArgs = 5,
    InvalidCellCount = 6,
    InvalidAsset = 7,
    InvalidDeposit = 8,
    InvalidPoolTransition = 9,
    InvalidCellShape = 10,
    RefundTooEarly = 11,
    InvalidRefundRecipient = 12,
    InvalidRefundValue = 13,
}

impl From<SysError> for Error {
    fn from(error: SysError) -> Self {
        match error {
            SysError::IndexOutOfBound => Self::IndexOutOfBound,
            SysError::ItemMissing => Self::ItemMissing,
            SysError::LengthNotEnough(_) => Self::LengthNotEnough,
            SysError::Encoding => Self::Encoding,
            SysError::Unknown(code) => panic!("unexpected syscall error {code}"),
            _ => panic!("unexpected spawn syscall error"),
        }
    }
}
