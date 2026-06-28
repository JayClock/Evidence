use super::DiagramNode;
use crate::domain::HasMany;

pub trait DiagramNodes: HasMany<DiagramNode> {}
