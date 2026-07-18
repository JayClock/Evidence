export type BoardItemLifecycle =
  | 'provisioning'
  | 'active'
  | 'terminal'
  | 'provisioning_failed'
  | 'archived';

export type FlowLane =
  | 'discovery'
  | 'planning'
  | 'ready'
  | 'delivery'
  | 'review'
  | 'done';

export interface BoardItem {
  iteration_id: string;
  candidate_id: string;
  lifecycle: BoardItemLifecycle;
  branch_name: string;
  worktree_path: string;
  base_sha: string;
  admitted_lane: FlowLane;
  pending_lane?: FlowLane;
  pending_lane_requested_at?: string;
  pending_state_sha256?: string;
  created_at: string;
  updated_at: string;
  terminal_at?: string;
  archived_at?: string;
}

/** Repository-local coordination state. Story delivery authority remains worktree-local. */
export interface BoardState {
  revision: number;
  next_iteration_number: number;
  items: BoardItem[];
}
