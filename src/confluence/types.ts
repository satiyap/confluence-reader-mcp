export type ConfluencePageResponse = {
  id: string;
  title: string;
  spaceId?: string;
  status?: string;
  parentId?: string;
  version?: { number?: number; createdAt?: string; message?: string };
  body?: {
    storage?: { value?: string; representation?: string };
    atlas_doc_format?: any;
  };
  _links?: { webui?: string };
};

export type ConfluenceChildrenResponse = {
  results: ConfluencePageResponse[];
  _links?: { next?: string };
};
