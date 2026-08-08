import client from './client';

export interface Resource {
  id: number;
  title: string;
  description: string;
  resource_type: string;
  file_path: string | null;
  file_size: number;
  thumbnail_path: string | null;
  external_url: string | null;
  team_id: number;
  partition_id: number | null;
  uploader_id: number;
  visibility: string;
  status: string;
  review_comment: string;
  created_at: string | null;
  updated_at: string | null;
  uploader?: { id: number; display_name: string } | null;
  like_count: number;
  urge_count: number;
  comment_count: number;
  images?: { id: number; file_path: string; sort_order: number }[];
  likes?: { user_id: number }[];
  urges?: { urger_id: number }[];
  comments?: {
    id: number; user_id: number; content: string;
    user?: { id: number; display_name: string } | null;
    created_at: string | null;
  }[];
  reviews?: {
    id: number; review_type: string; decision: string;
    comment: string; created_at: string | null;
  }[];
}

export const resourceApi = {
  list: (params?: Record<string, unknown>) =>
    client.get<Resource[]>('/resources', { params }),
  get: (id: number) => client.get<Resource>(`/resources/${id}`),
  create: (data: Record<string, unknown>) => client.post('/resources', data),
  update: (id: number, data: Record<string, unknown>) =>
    client.put(`/resources/${id}`, data),
  remove: (id: number) => client.delete(`/resources/${id}`),
  upload: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return client.post('/resources/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  submit: (id: number) => client.post(`/resources/${id}/submit`),
  like: (id: number) => client.post(`/resources/${id}/like`),
  unlike: (id: number) => client.delete(`/resources/${id}/like`),
  urge: (id: number) => client.post(`/resources/${id}/urge`),
  report: (id: number, reason: string) =>
    client.post(`/resources/${id}/report`, { reason }),
  addComment: (id: number, content: string) =>
    client.post(`/resources/${id}/comments`, { content }),
  uploadImages: (id: number, files: File[]) => {
    const fd = new FormData();
    files.forEach(f => fd.append('files', f));
    return client.post(`/resources/${id}/images`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  deleteImage: (resourceId: number, imageId: number) =>
    client.delete(`/resources/${resourceId}/images/${imageId}`),
};

export const statsApi = {
  overview: () => client.get('/stats/overview'),
  my: () => client.get('/stats/my'),
};

export const reviewApi = {
  pending: () => client.get('/reviews/pending'),
  submit: (data: { resource_id: number; decision: string; comment?: string }) =>
    client.post('/reviews', data),
  reports: () => client.get('/reviews/reports'),
  resolveReport: (id: number, data: { status: string }) =>
    client.put(`/reviews/reports/${id}/resolve`, data),
};
