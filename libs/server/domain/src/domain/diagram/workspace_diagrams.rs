use super::Diagram;
use crate::domain::HasOne;

pub trait WorkspaceDiagram: HasOne<Diagram> {}
