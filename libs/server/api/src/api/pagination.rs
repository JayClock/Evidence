use serde::Serialize;
use std::collections::BTreeMap;

use super::links::Link;

#[derive(Debug, Clone, Copy)]
pub(super) struct PageQuery {
    pub(super) page: u32,
    pub(super) page_size: u32,
    pub(super) total_elements: u64,
}

impl PageQuery {
    pub(super) fn total_pages(self) -> u32 {
        if self.total_elements == 0 {
            0
        } else {
            self.total_elements.div_ceil(self.page_size as u64) as u32
        }
    }

    pub(super) fn has_prev(self) -> bool {
        self.page > 1
    }

    pub(super) fn has_next(self) -> bool {
        self.page < self.total_pages()
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PageModel {
    number: u32,
    size: u32,
    total_elements: u64,
    total_pages: u32,
}

impl From<PageQuery> for PageModel {
    fn from(query: PageQuery) -> Self {
        Self {
            number: query.page,
            size: query.page_size,
            total_elements: query.total_elements,
            total_pages: query.total_pages(),
        }
    }
}

pub(super) fn add_page_links(
    links: &mut BTreeMap<String, Link>,
    page_query: PageQuery,
    page_href: impl Fn(u32) -> String,
) {
    if page_query.has_prev() {
        links.insert(
            "prev".to_string(),
            Link::new(page_href(page_query.page - 1)),
        );
    }
    if page_query.has_next() {
        links.insert(
            "next".to_string(),
            Link::new(page_href(page_query.page + 1)),
        );
    }
}
