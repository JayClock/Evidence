pub trait Entity {
    type Identity: ?Sized;
    type Description;

    fn identity(&self) -> &Self::Identity;
    fn description(&self) -> &Self::Description;
}
