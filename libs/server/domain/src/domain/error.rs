#[derive(Debug, Clone)]
pub enum ServerError {
    NotFound(String),
    Conflict(String),
    Validation(String),
    Internal(String),
}

impl std::fmt::Display for ServerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotFound(message)
            | Self::Conflict(message)
            | Self::Validation(message)
            | Self::Internal(message) => f.write_str(message),
        }
    }
}

impl std::error::Error for ServerError {}
