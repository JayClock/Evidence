use super::DiagramEdge;
use crate::domain::HasMany;

pub trait DiagramEdges: HasMany<DiagramEdge> {}
