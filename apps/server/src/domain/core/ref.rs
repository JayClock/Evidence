use std::ops::Deref;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Ref<T> {
    id: T,
}

impl<T> Ref<T> {
    pub fn new(id: T) -> Self {
        Self { id }
    }

    pub fn id(&self) -> &T {
        &self.id
    }

    pub fn into_id(self) -> T {
        self.id
    }
}

impl<T> From<T> for Ref<T> {
    fn from(id: T) -> Self {
        Self::new(id)
    }
}

impl From<&str> for Ref<String> {
    fn from(id: &str) -> Self {
        Self::new(id.to_string())
    }
}

impl Deref for Ref<String> {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        self.id().as_str()
    }
}

impl<T: std::fmt::Display> std::fmt::Display for Ref<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.id().fmt(f)
    }
}
