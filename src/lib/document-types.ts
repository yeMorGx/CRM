export type ClientDocument = {
  id: string;
  owner_id: string;
  lead_id: string | null;
  title: string;
  kind: "note" | "file";
  markdown: string;
  storage_path: string | null;
  mime_type: string | null;
  file_size: number | null;
  is_contract: boolean;
  signed_on: string | null;
  created_at: string;
  updated_at: string;
};
