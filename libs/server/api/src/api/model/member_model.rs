use serde::Serialize;
use std::collections::BTreeMap;

use crate::domain::Member;

use super::super::links::{
    user_href, workspace_href, workspace_member_href, workspace_members_href, Link,
};

#[derive(Debug, Clone, Serialize)]
struct RefModel {
    #[serde(rename = "_links")]
    links: BTreeMap<String, Link>,
    id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::api) struct MemberModel {
    #[serde(rename = "_links")]
    links: BTreeMap<String, Link>,
    id: String,
    workspace: RefModel,
    user: RefModel,
    role: String,
    created_at: String,
    updated_at: String,
}

pub(in crate::api) fn member_model(user_id: &str, member: &Member) -> MemberModel {
    let workspace_id = member.workspace_id();
    let member_user_id = member.description().user.id();
    MemberModel {
        links: BTreeMap::from([
            (
                "self".to_string(),
                Link::new(workspace_member_href(
                    user_id,
                    workspace_id,
                    member.identity(),
                )),
            ),
            (
                "collection".to_string(),
                Link::new(workspace_members_href(user_id, workspace_id)),
            ),
            (
                "workspace".to_string(),
                Link::new(workspace_href(user_id, workspace_id)),
            ),
            ("user".to_string(), Link::new(user_href(member_user_id))),
        ]),
        id: member.identity().to_string(),
        workspace: RefModel {
            links: BTreeMap::from([(
                "self".to_string(),
                Link::new(workspace_href(user_id, workspace_id)),
            )]),
            id: workspace_id.to_string(),
        },
        user: RefModel {
            links: BTreeMap::from([("self".to_string(), Link::new(user_href(member_user_id)))]),
            id: member_user_id.clone(),
        },
        role: member.description().role.clone(),
        created_at: member.created_at().to_string(),
        updated_at: member.updated_at().to_string(),
    }
}
