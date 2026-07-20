import { Link, link } from './links';

export interface PageQuery {
  page: number;
  pageSize: number;
  totalElements: number;
}

export interface PageModel {
  number: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export function totalPages(query: PageQuery): number {
  if (query.totalElements === 0) {
    return 0;
  }
  return Math.ceil(query.totalElements / query.pageSize);
}

export function pageModel(query: PageQuery): PageModel {
  return {
    number: query.page,
    size: query.pageSize,
    totalElements: query.totalElements,
    totalPages: totalPages(query),
  };
}

export function addPageLinks(
  links: Record<string, Link>,
  query: PageQuery,
  pageHref: (page: number) => string,
): void {
  if (query.page > 1) {
    links.prev = link(pageHref(query.page - 1));
  }
  if (query.page < totalPages(query)) {
    links.next = link(pageHref(query.page + 1));
  }
}
