use serde::Serialize;
use std::collections::BTreeMap;

use crate::domain::User;

use super::super::links::{user_href, user_sidebar_href, user_workspaces_href, Link};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::api) struct UserModel {
    #[serde(rename = "_links")]
    links: BTreeMap<String, Link>,
    id: String,
    name: String,
    email: Option<String>,
}

pub(in crate::api) fn user_model(user: &User) -> UserModel {
    let user_id = user.identity();
    UserModel {
        links: BTreeMap::from([
            ("self".to_string(), Link::new(user_href(user_id))),
            (
                "workspaces".to_string(),
                Link::new(user_workspaces_href(user_id)),
            ),
            ("sidebar".to_string(), Link::new(user_sidebar_href(user_id))),
        ]),
        id: user_id.to_string(),
        name: user.description().name.clone(),
        email: user.description().email.clone(),
    }
}
