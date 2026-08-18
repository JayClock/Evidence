-- Evidence Java Server initial PostgreSQL schema.
-- New installations start from this schema.

CREATE TABLE public.activity_runs (
    id text NOT NULL,
    workspace_id text NOT NULL,
    extraction_id text,
    iteration_id text,
    kind text NOT NULL,
    status text NOT NULL,
    capability_sha256 text NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL,
    started_at timestamp(3) without time zone NOT NULL,
    completed_at timestamp(3) without time zone,
    output_sha256 text,
    failure_summary text
);

CREATE TABLE public.approved_tasking_plans (
    id text NOT NULL,
    workspace_id text NOT NULL,
    iteration_id text NOT NULL,
    story_id text NOT NULL,
    story_revision_id text NOT NULL,
    tasking_candidate_id text NOT NULL,
    desk_check_decision_id text NOT NULL,
    payload jsonb NOT NULL,
    content_sha256 text NOT NULL,
    approved_by_user_id text NOT NULL,
    approved_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.desk_check_decisions (
    id text NOT NULL,
    reference text NOT NULL,
    workspace_id text NOT NULL,
    iteration_id text NOT NULL,
    candidate_id text NOT NULL,
    candidate_sha256 text NOT NULL,
    action text NOT NULL,
    reason text,
    decided_by_user_id text NOT NULL,
    decided_at timestamp(3) without time zone NOT NULL,
    content_sha256 text NOT NULL
);

CREATE TABLE public.diagram_edges (
    id text NOT NULL,
    diagram_id text NOT NULL,
    source_id text NOT NULL,
    target_id text NOT NULL,
    logical_relationship_id text,
    source_handle text,
    target_handle text,
    kind text,
    style jsonb DEFAULT '{}'::jsonb NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    animated boolean DEFAULT false NOT NULL,
    hidden boolean DEFAULT false NOT NULL,
    marker_start jsonb,
    marker_end jsonb,
    path_options jsonb DEFAULT '{}'::jsonb NOT NULL,
    interaction_width double precision,
    created_at timestamp(3) without time zone NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.diagram_nodes (
    id text NOT NULL,
    diagram_id text NOT NULL,
    kind text NOT NULL,
    logical_entity_id text,
    parent_id text,
    "position" jsonb NOT NULL,
    width double precision,
    height double precision,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(3) without time zone NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.diagrams (
    id text NOT NULL,
    workspace_id text NOT NULL,
    title text NOT NULL,
    viewport jsonb NOT NULL,
    created_at timestamp(3) without time zone NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    deleted_at timestamp(3) without time zone
);

CREATE TABLE public.inbox_candidate_decisions (
    id text NOT NULL,
    reference text NOT NULL,
    workspace_id text NOT NULL,
    candidate_id text NOT NULL,
    candidate_sha256 text NOT NULL,
    action text NOT NULL,
    reason text NOT NULL,
    decided_by_user_id text NOT NULL,
    decided_at timestamp(3) without time zone NOT NULL,
    content_sha256 text NOT NULL
);

CREATE TABLE public.inbox_extraction_sources (
    id text NOT NULL,
    extraction_id text NOT NULL,
    inbox_item_id text NOT NULL,
    inbox_revision_id text NOT NULL,
    "position" integer NOT NULL,
    revision_number integer NOT NULL,
    source_kind text NOT NULL,
    external_key text NOT NULL,
    item_status text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    content_type text NOT NULL,
    uri text,
    provider_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    source_updated_at timestamp(3) without time zone,
    captured_at timestamp(3) without time zone NOT NULL,
    content_sha256 text NOT NULL
);

CREATE TABLE public.inbox_extractions (
    id text NOT NULL,
    reference text NOT NULL,
    workspace_id text NOT NULL,
    status text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    requested_by_user_id text NOT NULL,
    requested_at timestamp(3) without time zone NOT NULL,
    completed_at timestamp(3) without time zone,
    failure_summary text
);

CREATE TABLE public.inbox_items (
    id text NOT NULL,
    workspace_id text NOT NULL,
    source_kind text NOT NULL,
    external_key text NOT NULL,
    title text NOT NULL,
    status text NOT NULL,
    latest_revision_id text,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp(3) without time zone NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.inbox_revisions (
    id text NOT NULL,
    inbox_item_id text NOT NULL,
    revision_number integer NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    content_type text NOT NULL,
    uri text,
    provider_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    source_updated_at timestamp(3) without time zone,
    captured_at timestamp(3) without time zone NOT NULL,
    content_sha256 text NOT NULL
);

CREATE TABLE public.inbox_story_candidates (
    id text NOT NULL,
    reference text NOT NULL,
    workspace_id text NOT NULL,
    extraction_id text NOT NULL,
    title text NOT NULL,
    problem text NOT NULL,
    role text NOT NULL,
    goal text NOT NULL,
    value text NOT NULL,
    cognitive_mode text NOT NULL,
    content_sha256 text NOT NULL,
    proposed_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.inbox_story_citations (
    id text NOT NULL,
    candidate_id text NOT NULL,
    inbox_item_id text NOT NULL,
    inbox_revision_id text NOT NULL,
    "position" integer NOT NULL,
    locator text NOT NULL,
    revision_sha256 text NOT NULL
);

CREATE TABLE public.iteration_intakes (
    iteration_id text NOT NULL,
    candidate_snapshot jsonb NOT NULL,
    source_snapshots jsonb NOT NULL,
    requirements_projection text NOT NULL,
    content_sha256 text NOT NULL,
    frozen_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.iterations (
    id text NOT NULL,
    reference text NOT NULL,
    workspace_id text NOT NULL,
    source_candidate_id text NOT NULL,
    source_candidate_sha256 text NOT NULL,
    lifecycle text NOT NULL,
    loop text NOT NULL,
    stage text NOT NULL,
    lane text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    base_commit_sha text NOT NULL,
    branch_name text,
    admitted_by_user_id text NOT NULL,
    admitted_at timestamp(3) without time zone NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    provisioning_failure_summary text
);

CREATE TABLE public.kickoff_decisions (
    id text NOT NULL,
    reference text NOT NULL,
    iteration_id text NOT NULL,
    proposal_id text NOT NULL,
    proposal_sha256 text NOT NULL,
    action text NOT NULL,
    reason text,
    decided_by_user_id text NOT NULL,
    decided_at timestamp(3) without time zone NOT NULL,
    content_sha256 text NOT NULL
);

CREATE TABLE public.kickoff_proposals (
    id text NOT NULL,
    reference text NOT NULL,
    iteration_id text NOT NULL,
    sequence integer NOT NULL,
    origin text NOT NULL,
    title text NOT NULL,
    problem text NOT NULL,
    role text NOT NULL,
    goal text NOT NULL,
    value text NOT NULL,
    cognitive_mode text NOT NULL,
    citations jsonb NOT NULL,
    content_sha256 text NOT NULL,
    proposed_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.logical_entities (
    id text NOT NULL,
    workspace_id text NOT NULL,
    type text NOT NULL,
    sub_type text,
    name text NOT NULL,
    label text,
    description text,
    attributes jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp(3) without time zone NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    deleted_at timestamp(3) without time zone
);

CREATE TABLE public.logical_relationships (
    id text NOT NULL,
    workspace_id text NOT NULL,
    source_id text NOT NULL,
    target_id text NOT NULL,
    label text,
    deleted_at timestamp(3) without time zone
);

CREATE TABLE public.no_model_impact_decisions (
    id text NOT NULL,
    reference text NOT NULL,
    workspace_id text NOT NULL,
    iteration_id text NOT NULL,
    story_id text NOT NULL,
    story_revision_id text NOT NULL,
    story_revision_sha256 text NOT NULL,
    reason text NOT NULL,
    decided_by_user_id text NOT NULL,
    decided_at timestamp(3) without time zone NOT NULL,
    content_sha256 text NOT NULL
);

CREATE TABLE public.pair_automation_exceptions (
    id text NOT NULL,
    pair_run_id text NOT NULL,
    action_id text,
    kind text NOT NULL,
    summary text NOT NULL,
    failure_fingerprint text,
    allowed_routes jsonb NOT NULL,
    raised_at timestamp(3) without time zone NOT NULL,
    resolved_at timestamp(3) without time zone,
    record_sha256 text NOT NULL
);

CREATE TABLE public.pair_coding_decisions (
    id text NOT NULL,
    pair_run_id text NOT NULL,
    sequence integer NOT NULL,
    action text NOT NULL,
    reason text NOT NULL,
    manifest_sha256 text,
    diff_sha256 text,
    commit_sha text,
    decided_by_user_id text NOT NULL,
    decided_at timestamp(3) without time zone NOT NULL,
    content_sha256 text NOT NULL
);

CREATE TABLE public.pair_command_observations (
    id text NOT NULL,
    pair_run_id text NOT NULL,
    action_id text NOT NULL,
    sequence integer NOT NULL,
    stage text NOT NULL,
    task_id text,
    test_id text,
    process_id text NOT NULL,
    step_id text,
    command text NOT NULL,
    termination text NOT NULL,
    exit_code integer,
    signal text,
    duration_ms integer NOT NULL,
    stdout_sha256 text NOT NULL,
    stdout_bytes integer NOT NULL,
    stdout_lines integer NOT NULL,
    stderr_sha256 text NOT NULL,
    stderr_bytes integer NOT NULL,
    stderr_lines integer NOT NULL,
    worktree_sha256 text NOT NULL,
    diff_sha256 text NOT NULL,
    failure_fingerprint text,
    observed_at timestamp(3) without time zone NOT NULL,
    previous_record_sha256 text,
    record_sha256 text NOT NULL
);

CREATE TABLE public.pair_driver_attempts (
    id text NOT NULL,
    pair_run_id text NOT NULL,
    action_id text NOT NULL,
    sequence integer NOT NULL,
    role text NOT NULL,
    mode text NOT NULL,
    task_id text,
    test_id text,
    process_id text,
    step_id text,
    summary text NOT NULL,
    changed_paths jsonb NOT NULL,
    before_worktree_sha256 text NOT NULL,
    after_worktree_sha256 text NOT NULL,
    diff_sha256 text NOT NULL,
    agent_call_count integer NOT NULL,
    input_tokens integer,
    output_tokens integer,
    completed_at timestamp(3) without time zone NOT NULL,
    record_sha256 text NOT NULL
);

CREATE TABLE public.pair_execution_manifests (
    id text NOT NULL,
    pair_run_id text NOT NULL,
    approved_tasking_plan_sha256 text NOT NULL,
    story_revision_sha256 text NOT NULL,
    base_commit_sha text NOT NULL,
    completed_test_ids jsonb NOT NULL,
    completed_step_keys jsonb NOT NULL,
    driver_attempt_ids jsonb NOT NULL,
    command_observation_ids jsonb NOT NULL,
    red_review_ids jsonb NOT NULL,
    changed_paths jsonb NOT NULL,
    final_diff_sha256 text NOT NULL,
    evidence_chain_sha256 text NOT NULL,
    generated_at timestamp(3) without time zone NOT NULL,
    content_sha256 text NOT NULL
);

CREATE TABLE public.pair_red_reviews (
    id text NOT NULL,
    pair_run_id text NOT NULL,
    action_id text NOT NULL,
    observation_id text NOT NULL,
    classification text NOT NULL,
    accepted boolean NOT NULL,
    reason text NOT NULL,
    reviewed_at timestamp(3) without time zone NOT NULL,
    record_sha256 text NOT NULL
);

CREATE TABLE public.pair_runs (
    id text NOT NULL,
    reference text NOT NULL,
    workspace_id text NOT NULL,
    iteration_id text NOT NULL,
    story_id text NOT NULL,
    story_revision_id text NOT NULL,
    story_revision_sha256 text NOT NULL,
    approved_tasking_plan_id text NOT NULL,
    approved_tasking_plan_sha256 text NOT NULL,
    base_commit_sha text NOT NULL,
    branch_name text NOT NULL,
    status text NOT NULL,
    checkpoint text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    cursor jsonb NOT NULL,
    completed_test_ids jsonb NOT NULL,
    completed_step_keys jsonb NOT NULL,
    execution_budget jsonb NOT NULL,
    budget_usage jsonb NOT NULL,
    lease_owner_id text,
    lease_token_sha256 text,
    lease_expires_at timestamp(3) without time zone,
    current_diff_sha256 text,
    final_manifest_sha256 text,
    approved_commit_sha text,
    started_at timestamp(3) without time zone NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    completed_at timestamp(3) without time zone
);

CREATE TABLE public.problem_statement_revisions (
    id text NOT NULL,
    story_id text NOT NULL,
    iteration_id text NOT NULL,
    revision_number integer NOT NULL,
    title text NOT NULL,
    problem text NOT NULL,
    cognitive_mode text NOT NULL,
    citations jsonb NOT NULL,
    content_sha256 text NOT NULL,
    created_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.respond_candidates (
    id text NOT NULL,
    reference text NOT NULL,
    sequence integer NOT NULL,
    action_id text NOT NULL,
    workspace_id text NOT NULL,
    iteration_id text NOT NULL,
    story_id text NOT NULL,
    story_revision_id text NOT NULL,
    showcase_run_id text NOT NULL,
    showcase_decision_id text NOT NULL,
    authority jsonb NOT NULL,
    authority_sha256 text NOT NULL,
    promotions jsonb NOT NULL,
    no_promotion_reason text,
    observed_outcomes jsonb NOT NULL,
    residual_risks jsonb NOT NULL,
    next_probe jsonb NOT NULL,
    proposed_at timestamp(3) without time zone NOT NULL,
    content_sha256 text NOT NULL
);

CREATE TABLE public.respond_decisions (
    id text NOT NULL,
    candidate_id text NOT NULL,
    action text NOT NULL,
    reason text NOT NULL,
    candidate_sha256 text NOT NULL,
    authority_sha256 text NOT NULL,
    decided_by_user_id text NOT NULL,
    decided_at timestamp(3) without time zone NOT NULL,
    content_sha256 text NOT NULL
);

CREATE TABLE public.scenario_drafts (
    id text NOT NULL,
    reference text NOT NULL,
    proposal_id text NOT NULL,
    "position" integer NOT NULL,
    title text NOT NULL,
    given_steps jsonb NOT NULL,
    when_step text NOT NULL,
    then_steps jsonb NOT NULL,
    business_data jsonb NOT NULL,
    content_sha256 text NOT NULL
);

CREATE TABLE public.scenario_set_proposals (
    id text NOT NULL,
    reference text NOT NULL,
    workspace_id text NOT NULL,
    iteration_id text NOT NULL,
    story_id text NOT NULL,
    story_revision_id text NOT NULL,
    sequence integer NOT NULL,
    content_sha256 text NOT NULL,
    proposed_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.showcase_decisions (
    id text NOT NULL,
    showcase_run_id text NOT NULL,
    action text NOT NULL,
    reason text NOT NULL,
    feedback_target text,
    evidence_bundle_sha256 text,
    review_id text,
    decided_by_user_id text NOT NULL,
    decided_at timestamp(3) without time zone NOT NULL,
    content_sha256 text NOT NULL
);

CREATE TABLE public.showcase_evaluations (
    id text NOT NULL,
    showcase_run_id text NOT NULL,
    sequence integer NOT NULL,
    quadrant text NOT NULL,
    activity text NOT NULL,
    outcome text NOT NULL,
    finding text NOT NULL,
    evidence_refs jsonb NOT NULL,
    observed_by_user_id text NOT NULL,
    observed_at timestamp(3) without time zone NOT NULL,
    content_sha256 text NOT NULL
);

CREATE TABLE public.showcase_product_observations (
    id text NOT NULL,
    showcase_run_id text NOT NULL,
    scenario_id text NOT NULL,
    scenario_reference text NOT NULL,
    given_steps jsonb NOT NULL,
    when_step text NOT NULL,
    expected_then_steps jsonb NOT NULL,
    business_data jsonb NOT NULL,
    observed_outcomes jsonb NOT NULL,
    observation text NOT NULL,
    value_feedback text NOT NULL,
    evidence_refs jsonb NOT NULL,
    observed_by_user_id text NOT NULL,
    observed_at timestamp(3) without time zone NOT NULL,
    content_sha256 text NOT NULL
);

CREATE TABLE public.showcase_q2_observations (
    id text NOT NULL,
    showcase_run_id text NOT NULL,
    action_id text NOT NULL,
    sequence integer NOT NULL,
    test_id text NOT NULL,
    scenario_ids jsonb NOT NULL,
    process_id text NOT NULL,
    step_id text NOT NULL,
    project_id text,
    command text NOT NULL,
    termination text NOT NULL,
    exit_code integer,
    signal text,
    duration_ms integer NOT NULL,
    stdout_sha256 text NOT NULL,
    stdout_bytes integer NOT NULL,
    stdout_lines integer NOT NULL,
    stderr_sha256 text NOT NULL,
    stderr_bytes integer NOT NULL,
    stderr_lines integer NOT NULL,
    approved_commit_sha text NOT NULL,
    worktree_sha256 text NOT NULL,
    observed_at timestamp(3) without time zone NOT NULL,
    previous_record_sha256 text,
    record_sha256 text NOT NULL
);

CREATE TABLE public.showcase_reviews (
    id text NOT NULL,
    showcase_run_id text NOT NULL,
    evidence_bundle_sha256 text NOT NULL,
    observed_facts jsonb NOT NULL,
    product_domain_feedback jsonb NOT NULL,
    technical_quality_feedback jsonb NOT NULL,
    unresolved_assumptions jsonb NOT NULL,
    recommendation text NOT NULL,
    reviewed_at timestamp(3) without time zone NOT NULL,
    content_sha256 text NOT NULL
);

CREATE TABLE public.showcase_risk_decisions (
    id text NOT NULL,
    showcase_run_id text NOT NULL,
    quadrant text NOT NULL,
    disposition text NOT NULL,
    activities jsonb NOT NULL,
    reason text NOT NULL,
    decided_by_user_id text NOT NULL,
    decided_at timestamp(3) without time zone NOT NULL,
    content_sha256 text NOT NULL
);

CREATE TABLE public.showcase_runs (
    id text NOT NULL,
    reference text NOT NULL,
    attempt integer NOT NULL,
    workspace_id text NOT NULL,
    iteration_id text NOT NULL,
    story_id text NOT NULL,
    story_revision_id text NOT NULL,
    story_revision_sha256 text NOT NULL,
    approved_tasking_plan_id text NOT NULL,
    approved_tasking_plan_sha256 text NOT NULL,
    pair_run_id text NOT NULL,
    pair_manifest_id text NOT NULL,
    pair_manifest_sha256 text NOT NULL,
    approved_commit_sha text NOT NULL,
    stage text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    evidence_bundle_sha256 text,
    started_at timestamp(3) without time zone NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    completed_at timestamp(3) without time zone
);

CREATE TABLE public.stories (
    id text NOT NULL,
    workspace_id text NOT NULL,
    latest_revision_id text,
    created_at timestamp(3) without time zone NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    iteration_id text,
    reference text NOT NULL
);

CREATE TABLE public.story_card_revisions (
    id text NOT NULL,
    story_id text NOT NULL,
    iteration_id text NOT NULL,
    problem_statement_id text NOT NULL,
    revision_number integer NOT NULL,
    title text NOT NULL,
    role text NOT NULL,
    goal text NOT NULL,
    value text NOT NULL,
    content_sha256 text NOT NULL,
    created_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.story_clarifications (
    id text NOT NULL,
    reference text NOT NULL,
    workspace_id text NOT NULL,
    iteration_id text NOT NULL,
    story_id text NOT NULL,
    story_revision_id text NOT NULL,
    sequence integer NOT NULL,
    target text NOT NULL,
    question text NOT NULL,
    status text NOT NULL,
    asked_at timestamp(3) without time zone NOT NULL,
    answer text,
    answered_by_user_id text,
    answered_at timestamp(3) without time zone,
    waived_reason text,
    waived_by_user_id text,
    waived_at timestamp(3) without time zone,
    content_sha256 text NOT NULL
);

CREATE TABLE public.story_revision_citations (
    id text NOT NULL,
    story_revision_id text NOT NULL,
    inbox_revision_id text NOT NULL,
    "position" integer NOT NULL,
    locator text NOT NULL
);

CREATE TABLE public.story_revisions (
    id text NOT NULL,
    story_id text NOT NULL,
    revision_number integer NOT NULL,
    title text NOT NULL,
    problem text NOT NULL,
    role text NOT NULL,
    goal text NOT NULL,
    value text NOT NULL,
    cognitive_mode text NOT NULL,
    content_sha256 text NOT NULL,
    created_by_user_id text NOT NULL,
    created_at timestamp(3) without time zone NOT NULL,
    understanding_decision_id text
);

CREATE TABLE public.story_scenarios (
    id text NOT NULL,
    story_revision_id text NOT NULL,
    "position" integer NOT NULL,
    title text NOT NULL,
    given_steps jsonb NOT NULL,
    when_step text NOT NULL,
    then_steps jsonb NOT NULL,
    reference text NOT NULL,
    source_draft_id text NOT NULL,
    understanding_decision_id text NOT NULL,
    business_data jsonb NOT NULL,
    confirmed_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.tasking_candidates (
    id text NOT NULL,
    reference text NOT NULL,
    workspace_id text NOT NULL,
    iteration_id text NOT NULL,
    story_id text NOT NULL,
    story_revision_id text NOT NULL,
    story_revision_sha256 text NOT NULL,
    base_commit_sha text NOT NULL,
    no_model_impact_decision_id text NOT NULL,
    no_model_impact_decision_sha256 text NOT NULL,
    sequence integer NOT NULL,
    project_catalog_sha256 text NOT NULL,
    payload jsonb NOT NULL,
    content_sha256 text NOT NULL,
    proposed_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.understanding_decisions (
    id text NOT NULL,
    reference text NOT NULL,
    workspace_id text NOT NULL,
    iteration_id text NOT NULL,
    story_id text NOT NULL,
    story_revision_id text NOT NULL,
    proposal_id text,
    proposal_sha256 text,
    action text NOT NULL,
    reason text,
    selected_draft_ids jsonb NOT NULL,
    confirmed_scenario_ids jsonb NOT NULL,
    decided_by_user_id text NOT NULL,
    decided_at timestamp(3) without time zone NOT NULL,
    content_sha256 text NOT NULL
);

CREATE TABLE public.user_identities (
    id text NOT NULL,
    user_id text NOT NULL,
    issuer text NOT NULL,
    subject text NOT NULL,
    created_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.users (
    id text NOT NULL,
    name text NOT NULL,
    email text
);

CREATE TABLE public.workspace_memberships (
    id text NOT NULL,
    workspace_id text NOT NULL,
    user_id text NOT NULL,
    role text NOT NULL,
    created_at timestamp(3) without time zone NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.workspace_sequences (
    workspace_id text NOT NULL,
    next_extraction_number integer DEFAULT 1 NOT NULL,
    next_candidate_number integer DEFAULT 1 NOT NULL,
    next_decision_number integer DEFAULT 1 NOT NULL,
    next_iteration_number integer DEFAULT 1 NOT NULL,
    next_kickoff_number integer DEFAULT 1 NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.workspaces (
    id text NOT NULL,
    title text NOT NULL,
    description text,
    status text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(3) without time zone NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    deleted_at timestamp(3) without time zone,
    model_root text NOT NULL
);

ALTER TABLE ONLY public.activity_runs
    ADD CONSTRAINT activity_runs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.approved_tasking_plans
    ADD CONSTRAINT approved_tasking_plans_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.desk_check_decisions
    ADD CONSTRAINT desk_check_decisions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.diagram_edges
    ADD CONSTRAINT diagram_edges_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.diagram_nodes
    ADD CONSTRAINT diagram_nodes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.diagrams
    ADD CONSTRAINT diagrams_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.inbox_candidate_decisions
    ADD CONSTRAINT inbox_candidate_decisions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.inbox_extraction_sources
    ADD CONSTRAINT inbox_extraction_sources_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.inbox_extractions
    ADD CONSTRAINT inbox_extractions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.inbox_items
    ADD CONSTRAINT inbox_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.inbox_revisions
    ADD CONSTRAINT inbox_revisions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.inbox_story_candidates
    ADD CONSTRAINT inbox_story_candidates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.inbox_story_citations
    ADD CONSTRAINT inbox_story_citations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.iteration_intakes
    ADD CONSTRAINT iteration_intakes_pkey PRIMARY KEY (iteration_id);

ALTER TABLE ONLY public.iterations
    ADD CONSTRAINT iterations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.kickoff_decisions
    ADD CONSTRAINT kickoff_decisions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.kickoff_proposals
    ADD CONSTRAINT kickoff_proposals_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.logical_entities
    ADD CONSTRAINT logical_entities_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.logical_relationships
    ADD CONSTRAINT logical_relationships_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.no_model_impact_decisions
    ADD CONSTRAINT no_model_impact_decisions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.pair_automation_exceptions
    ADD CONSTRAINT pair_automation_exceptions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.pair_coding_decisions
    ADD CONSTRAINT pair_coding_decisions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.pair_command_observations
    ADD CONSTRAINT pair_command_observations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.pair_driver_attempts
    ADD CONSTRAINT pair_driver_attempts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.pair_execution_manifests
    ADD CONSTRAINT pair_execution_manifests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.pair_red_reviews
    ADD CONSTRAINT pair_red_reviews_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.pair_runs
    ADD CONSTRAINT pair_runs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.problem_statement_revisions
    ADD CONSTRAINT problem_statement_revisions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.respond_candidates
    ADD CONSTRAINT respond_candidates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.respond_decisions
    ADD CONSTRAINT respond_decisions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.scenario_drafts
    ADD CONSTRAINT scenario_drafts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.scenario_set_proposals
    ADD CONSTRAINT scenario_set_proposals_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.showcase_decisions
    ADD CONSTRAINT showcase_decisions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.showcase_evaluations
    ADD CONSTRAINT showcase_evaluations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.showcase_product_observations
    ADD CONSTRAINT showcase_product_observations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.showcase_q2_observations
    ADD CONSTRAINT showcase_q2_observations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.showcase_reviews
    ADD CONSTRAINT showcase_reviews_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.showcase_risk_decisions
    ADD CONSTRAINT showcase_risk_decisions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.showcase_runs
    ADD CONSTRAINT showcase_runs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT stories_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.story_card_revisions
    ADD CONSTRAINT story_card_revisions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.story_clarifications
    ADD CONSTRAINT story_clarifications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.story_revision_citations
    ADD CONSTRAINT story_revision_citations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.story_revisions
    ADD CONSTRAINT story_revisions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.story_scenarios
    ADD CONSTRAINT story_scenarios_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tasking_candidates
    ADD CONSTRAINT tasking_candidates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.understanding_decisions
    ADD CONSTRAINT understanding_decisions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_identities
    ADD CONSTRAINT user_identities_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.workspace_memberships
    ADD CONSTRAINT workspace_memberships_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.workspace_sequences
    ADD CONSTRAINT workspace_sequences_pkey PRIMARY KEY (workspace_id);

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);

CREATE INDEX activity_runs_extraction_id_idx ON public.activity_runs USING btree (extraction_id);

CREATE INDEX activity_runs_iteration_id_idx ON public.activity_runs USING btree (iteration_id);

CREATE INDEX activity_runs_workspace_id_status_expires_at_idx ON public.activity_runs USING btree (workspace_id, status, expires_at);

CREATE UNIQUE INDEX approved_tasking_plans_desk_check_decision_id_key ON public.approved_tasking_plans USING btree (desk_check_decision_id);

CREATE INDEX approved_tasking_plans_iteration_id_approved_at_idx ON public.approved_tasking_plans USING btree (iteration_id, approved_at);

CREATE UNIQUE INDEX approved_tasking_plans_tasking_candidate_id_key ON public.approved_tasking_plans USING btree (tasking_candidate_id);

CREATE INDEX approved_tasking_plans_workspace_id_approved_at_idx ON public.approved_tasking_plans USING btree (workspace_id, approved_at);

CREATE UNIQUE INDEX desk_check_decisions_candidate_id_key ON public.desk_check_decisions USING btree (candidate_id);

CREATE UNIQUE INDEX desk_check_decisions_iteration_id_reference_key ON public.desk_check_decisions USING btree (iteration_id, reference);

CREATE INDEX desk_check_decisions_workspace_id_iteration_id_decided_at_idx ON public.desk_check_decisions USING btree (workspace_id, iteration_id, decided_at);

CREATE INDEX diagram_edges_diagram_id_idx ON public.diagram_edges USING btree (diagram_id);

CREATE INDEX diagram_nodes_diagram_id_idx ON public.diagram_nodes USING btree (diagram_id);

CREATE INDEX diagrams_workspace_id_deleted_at_idx ON public.diagrams USING btree (workspace_id, deleted_at);

CREATE UNIQUE INDEX inbox_candidate_decisions_candidate_id_key ON public.inbox_candidate_decisions USING btree (candidate_id);

CREATE INDEX inbox_candidate_decisions_workspace_id_decided_at_idx ON public.inbox_candidate_decisions USING btree (workspace_id, decided_at);

CREATE UNIQUE INDEX inbox_candidate_decisions_workspace_id_reference_key ON public.inbox_candidate_decisions USING btree (workspace_id, reference);

CREATE UNIQUE INDEX inbox_extraction_sources_extraction_id_inbox_item_id_key ON public.inbox_extraction_sources USING btree (extraction_id, inbox_item_id);

CREATE UNIQUE INDEX inbox_extraction_sources_extraction_id_position_key ON public.inbox_extraction_sources USING btree (extraction_id, "position");

CREATE INDEX inbox_extraction_sources_inbox_revision_id_idx ON public.inbox_extraction_sources USING btree (inbox_revision_id);

CREATE UNIQUE INDEX inbox_extractions_workspace_id_reference_key ON public.inbox_extractions USING btree (workspace_id, reference);

CREATE INDEX inbox_extractions_workspace_id_status_requested_at_idx ON public.inbox_extractions USING btree (workspace_id, status, requested_at);

CREATE UNIQUE INDEX inbox_items_latest_revision_id_key ON public.inbox_items USING btree (latest_revision_id);

CREATE UNIQUE INDEX inbox_items_workspace_id_source_kind_external_key_key ON public.inbox_items USING btree (workspace_id, source_kind, external_key);

CREATE INDEX inbox_items_workspace_id_status_updated_at_idx ON public.inbox_items USING btree (workspace_id, status, updated_at);

CREATE UNIQUE INDEX inbox_revisions_inbox_item_id_content_sha256_key ON public.inbox_revisions USING btree (inbox_item_id, content_sha256);

CREATE UNIQUE INDEX inbox_revisions_inbox_item_id_revision_number_key ON public.inbox_revisions USING btree (inbox_item_id, revision_number);

CREATE INDEX inbox_story_candidates_workspace_id_proposed_at_idx ON public.inbox_story_candidates USING btree (workspace_id, proposed_at);

CREATE UNIQUE INDEX inbox_story_candidates_workspace_id_reference_key ON public.inbox_story_candidates USING btree (workspace_id, reference);

CREATE UNIQUE INDEX inbox_story_citation_revision_locator_key ON public.inbox_story_citations USING btree (candidate_id, inbox_revision_id, locator);

CREATE UNIQUE INDEX inbox_story_citations_candidate_id_position_key ON public.inbox_story_citations USING btree (candidate_id, "position");

CREATE INDEX inbox_story_citations_inbox_revision_id_idx ON public.inbox_story_citations USING btree (inbox_revision_id);

CREATE UNIQUE INDEX iterations_source_candidate_id_key ON public.iterations USING btree (source_candidate_id);

CREATE INDEX iterations_workspace_id_lifecycle_lane_admitted_at_idx ON public.iterations USING btree (workspace_id, lifecycle, lane, admitted_at);

CREATE UNIQUE INDEX iterations_workspace_id_reference_key ON public.iterations USING btree (workspace_id, reference);

CREATE INDEX kickoff_decisions_iteration_id_decided_at_idx ON public.kickoff_decisions USING btree (iteration_id, decided_at);

CREATE UNIQUE INDEX kickoff_decisions_iteration_id_reference_key ON public.kickoff_decisions USING btree (iteration_id, reference);

CREATE UNIQUE INDEX kickoff_decisions_proposal_id_key ON public.kickoff_decisions USING btree (proposal_id);

CREATE INDEX kickoff_proposals_iteration_id_proposed_at_idx ON public.kickoff_proposals USING btree (iteration_id, proposed_at);

CREATE UNIQUE INDEX kickoff_proposals_iteration_id_reference_key ON public.kickoff_proposals USING btree (iteration_id, reference);

CREATE UNIQUE INDEX kickoff_proposals_iteration_id_sequence_key ON public.kickoff_proposals USING btree (iteration_id, sequence);

CREATE INDEX logical_entities_workspace_id_deleted_at_idx ON public.logical_entities USING btree (workspace_id, deleted_at);

CREATE INDEX logical_relationships_workspace_id_deleted_at_idx ON public.logical_relationships USING btree (workspace_id, deleted_at);

CREATE UNIQUE INDEX no_model_impact_decisions_iteration_id_reference_key ON public.no_model_impact_decisions USING btree (iteration_id, reference);

CREATE UNIQUE INDEX no_model_impact_decisions_story_revision_id_key ON public.no_model_impact_decisions USING btree (story_revision_id);

CREATE INDEX no_model_impact_decisions_workspace_id_iteration_id_decided_at_ ON public.no_model_impact_decisions USING btree (workspace_id, iteration_id, decided_at);

CREATE INDEX pair_automation_exceptions_pair_run_id_resolved_at_raised_at_id ON public.pair_automation_exceptions USING btree (pair_run_id, resolved_at, raised_at);

CREATE INDEX pair_coding_decisions_pair_run_id_decided_at_idx ON public.pair_coding_decisions USING btree (pair_run_id, decided_at);

CREATE UNIQUE INDEX pair_coding_decisions_pair_run_id_sequence_key ON public.pair_coding_decisions USING btree (pair_run_id, sequence);

CREATE UNIQUE INDEX pair_command_observations_pair_run_id_action_id_key ON public.pair_command_observations USING btree (pair_run_id, action_id);

CREATE UNIQUE INDEX pair_command_observations_pair_run_id_sequence_key ON public.pair_command_observations USING btree (pair_run_id, sequence);

CREATE UNIQUE INDEX pair_driver_attempts_pair_run_id_action_id_key ON public.pair_driver_attempts USING btree (pair_run_id, action_id);

CREATE UNIQUE INDEX pair_driver_attempts_pair_run_id_sequence_key ON public.pair_driver_attempts USING btree (pair_run_id, sequence);

CREATE INDEX pair_execution_manifests_pair_run_id_generated_at_idx ON public.pair_execution_manifests USING btree (pair_run_id, generated_at);

CREATE UNIQUE INDEX pair_red_reviews_observation_id_key ON public.pair_red_reviews USING btree (observation_id);

CREATE UNIQUE INDEX pair_red_reviews_pair_run_id_action_id_key ON public.pair_red_reviews USING btree (pair_run_id, action_id);

CREATE INDEX pair_red_reviews_pair_run_id_reviewed_at_idx ON public.pair_red_reviews USING btree (pair_run_id, reviewed_at);

CREATE UNIQUE INDEX pair_runs_approved_tasking_plan_id_key ON public.pair_runs USING btree (approved_tasking_plan_id);

CREATE UNIQUE INDEX pair_runs_iteration_id_reference_key ON public.pair_runs USING btree (iteration_id, reference);

CREATE INDEX pair_runs_iteration_id_started_at_idx ON public.pair_runs USING btree (iteration_id, started_at);

CREATE UNIQUE INDEX pair_runs_one_open_per_iteration ON public.pair_runs USING btree (iteration_id) WHERE (status = ANY (ARRAY['running'::text, 'approval_required'::text, 'exception'::text]));

CREATE UNIQUE INDEX pair_runs_one_open_per_workspace ON public.pair_runs USING btree (workspace_id) WHERE (status = ANY (ARRAY['running'::text, 'approval_required'::text, 'exception'::text]));

CREATE INDEX pair_runs_workspace_id_status_updated_at_idx ON public.pair_runs USING btree (workspace_id, status, updated_at);

CREATE INDEX problem_statement_revisions_iteration_id_idx ON public.problem_statement_revisions USING btree (iteration_id);

CREATE UNIQUE INDEX problem_statement_revisions_story_id_revision_number_key ON public.problem_statement_revisions USING btree (story_id, revision_number);

CREATE UNIQUE INDEX respond_candidates_iteration_id_action_id_key ON public.respond_candidates USING btree (iteration_id, action_id);

CREATE INDEX respond_candidates_iteration_id_proposed_at_idx ON public.respond_candidates USING btree (iteration_id, proposed_at);

CREATE UNIQUE INDEX respond_candidates_iteration_id_sequence_key ON public.respond_candidates USING btree (iteration_id, sequence);

CREATE UNIQUE INDEX respond_candidates_workspace_id_reference_key ON public.respond_candidates USING btree (workspace_id, reference);

CREATE UNIQUE INDEX respond_decisions_candidate_id_key ON public.respond_decisions USING btree (candidate_id);

CREATE INDEX respond_decisions_decided_by_user_id_decided_at_idx ON public.respond_decisions USING btree (decided_by_user_id, decided_at);

CREATE UNIQUE INDEX scenario_drafts_proposal_id_position_key ON public.scenario_drafts USING btree (proposal_id, "position");

CREATE UNIQUE INDEX scenario_drafts_proposal_id_reference_key ON public.scenario_drafts USING btree (proposal_id, reference);

CREATE UNIQUE INDEX scenario_set_proposals_iteration_id_reference_key ON public.scenario_set_proposals USING btree (iteration_id, reference);

CREATE UNIQUE INDEX scenario_set_proposals_iteration_id_sequence_key ON public.scenario_set_proposals USING btree (iteration_id, sequence);

CREATE INDEX scenario_set_proposals_story_revision_id_idx ON public.scenario_set_proposals USING btree (story_revision_id);

CREATE INDEX scenario_set_proposals_workspace_id_iteration_id_proposed_at_id ON public.scenario_set_proposals USING btree (workspace_id, iteration_id, proposed_at);

CREATE INDEX showcase_decisions_decided_by_user_id_decided_at_idx ON public.showcase_decisions USING btree (decided_by_user_id, decided_at);

CREATE UNIQUE INDEX showcase_decisions_showcase_run_id_key ON public.showcase_decisions USING btree (showcase_run_id);

CREATE INDEX showcase_evaluations_showcase_run_id_quadrant_activity_obse_idx ON public.showcase_evaluations USING btree (showcase_run_id, quadrant, activity, observed_at);

CREATE UNIQUE INDEX showcase_evaluations_showcase_run_id_sequence_key ON public.showcase_evaluations USING btree (showcase_run_id, sequence);

CREATE INDEX showcase_product_observations_scenario_id_idx ON public.showcase_product_observations USING btree (scenario_id);

CREATE UNIQUE INDEX showcase_product_observations_showcase_run_id_scenario_id_key ON public.showcase_product_observations USING btree (showcase_run_id, scenario_id);

CREATE UNIQUE INDEX showcase_q2_observations_showcase_run_id_action_id_key ON public.showcase_q2_observations USING btree (showcase_run_id, action_id);

CREATE UNIQUE INDEX showcase_q2_observations_showcase_run_id_sequence_key ON public.showcase_q2_observations USING btree (showcase_run_id, sequence);

CREATE UNIQUE INDEX showcase_q2_observations_showcase_run_id_test_id_key ON public.showcase_q2_observations USING btree (showcase_run_id, test_id);

CREATE UNIQUE INDEX showcase_reviews_showcase_run_id_key ON public.showcase_reviews USING btree (showcase_run_id);

CREATE UNIQUE INDEX showcase_risk_decisions_showcase_run_id_quadrant_key ON public.showcase_risk_decisions USING btree (showcase_run_id, quadrant);

CREATE UNIQUE INDEX showcase_runs_iteration_id_attempt_key ON public.showcase_runs USING btree (iteration_id, attempt);

CREATE INDEX showcase_runs_pair_run_id_started_at_idx ON public.showcase_runs USING btree (pair_run_id, started_at);

CREATE UNIQUE INDEX showcase_runs_workspace_id_reference_key ON public.showcase_runs USING btree (workspace_id, reference);

CREATE INDEX showcase_runs_workspace_id_stage_updated_at_idx ON public.showcase_runs USING btree (workspace_id, stage, updated_at);

CREATE UNIQUE INDEX stories_iteration_id_key ON public.stories USING btree (iteration_id);

CREATE UNIQUE INDEX stories_latest_revision_id_key ON public.stories USING btree (latest_revision_id);

CREATE INDEX stories_workspace_id_updated_at_idx ON public.stories USING btree (workspace_id, updated_at);

CREATE INDEX story_card_revisions_iteration_id_idx ON public.story_card_revisions USING btree (iteration_id);

CREATE INDEX story_card_revisions_problem_statement_id_idx ON public.story_card_revisions USING btree (problem_statement_id);

CREATE UNIQUE INDEX story_card_revisions_story_id_revision_number_key ON public.story_card_revisions USING btree (story_id, revision_number);

CREATE UNIQUE INDEX story_clarifications_iteration_id_reference_key ON public.story_clarifications USING btree (iteration_id, reference);

CREATE UNIQUE INDEX story_clarifications_iteration_id_sequence_key ON public.story_clarifications USING btree (iteration_id, sequence);

CREATE INDEX story_clarifications_story_revision_id_idx ON public.story_clarifications USING btree (story_revision_id);

CREATE INDEX story_clarifications_workspace_id_iteration_id_asked_at_idx ON public.story_clarifications USING btree (workspace_id, iteration_id, asked_at);

CREATE UNIQUE INDEX story_revision_citation_revision_locator_key ON public.story_revision_citations USING btree (story_revision_id, inbox_revision_id, locator);

CREATE INDEX story_revision_citations_inbox_revision_id_idx ON public.story_revision_citations USING btree (inbox_revision_id);

CREATE UNIQUE INDEX story_revision_citations_story_revision_id_position_key ON public.story_revision_citations USING btree (story_revision_id, "position");

CREATE INDEX story_revisions_story_id_created_at_idx ON public.story_revisions USING btree (story_id, created_at);

CREATE UNIQUE INDEX story_revisions_story_id_revision_number_key ON public.story_revisions USING btree (story_id, revision_number);

CREATE UNIQUE INDEX story_revisions_understanding_decision_id_key ON public.story_revisions USING btree (understanding_decision_id);

CREATE INDEX story_scenarios_source_draft_id_idx ON public.story_scenarios USING btree (source_draft_id);

CREATE UNIQUE INDEX story_scenarios_story_revision_id_position_key ON public.story_scenarios USING btree (story_revision_id, "position");

CREATE UNIQUE INDEX story_scenarios_story_revision_id_reference_key ON public.story_scenarios USING btree (story_revision_id, reference);

CREATE INDEX story_scenarios_understanding_decision_id_idx ON public.story_scenarios USING btree (understanding_decision_id);

CREATE UNIQUE INDEX tasking_candidates_iteration_id_reference_key ON public.tasking_candidates USING btree (iteration_id, reference);

CREATE UNIQUE INDEX tasking_candidates_iteration_id_sequence_key ON public.tasking_candidates USING btree (iteration_id, sequence);

CREATE INDEX tasking_candidates_workspace_id_iteration_id_proposed_at_idx ON public.tasking_candidates USING btree (workspace_id, iteration_id, proposed_at);

CREATE UNIQUE INDEX understanding_decisions_iteration_id_reference_key ON public.understanding_decisions USING btree (iteration_id, reference);

CREATE UNIQUE INDEX understanding_decisions_proposal_id_key ON public.understanding_decisions USING btree (proposal_id);

CREATE INDEX understanding_decisions_story_revision_id_idx ON public.understanding_decisions USING btree (story_revision_id);

CREATE INDEX understanding_decisions_workspace_id_iteration_id_decided_at_id ON public.understanding_decisions USING btree (workspace_id, iteration_id, decided_at);

CREATE UNIQUE INDEX user_identities_issuer_subject_key ON public.user_identities USING btree (issuer, subject);

CREATE INDEX user_identities_user_id_idx ON public.user_identities USING btree (user_id);

CREATE INDEX workspace_memberships_user_id_idx ON public.workspace_memberships USING btree (user_id);

CREATE UNIQUE INDEX workspace_memberships_workspace_id_user_id_key ON public.workspace_memberships USING btree (workspace_id, user_id);

CREATE INDEX workspaces_deleted_at_idx ON public.workspaces USING btree (deleted_at);

ALTER TABLE ONLY public.activity_runs
    ADD CONSTRAINT activity_runs_extraction_id_fkey FOREIGN KEY (extraction_id) REFERENCES public.inbox_extractions(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.activity_runs
    ADD CONSTRAINT activity_runs_iteration_id_fkey FOREIGN KEY (iteration_id) REFERENCES public.iterations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.activity_runs
    ADD CONSTRAINT activity_runs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.approved_tasking_plans
    ADD CONSTRAINT approved_tasking_plans_approved_by_user_id_fkey FOREIGN KEY (approved_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.approved_tasking_plans
    ADD CONSTRAINT approved_tasking_plans_desk_check_decision_id_fkey FOREIGN KEY (desk_check_decision_id) REFERENCES public.desk_check_decisions(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.approved_tasking_plans
    ADD CONSTRAINT approved_tasking_plans_iteration_id_fkey FOREIGN KEY (iteration_id) REFERENCES public.iterations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.approved_tasking_plans
    ADD CONSTRAINT approved_tasking_plans_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.approved_tasking_plans
    ADD CONSTRAINT approved_tasking_plans_story_revision_id_fkey FOREIGN KEY (story_revision_id) REFERENCES public.story_revisions(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.approved_tasking_plans
    ADD CONSTRAINT approved_tasking_plans_tasking_candidate_id_fkey FOREIGN KEY (tasking_candidate_id) REFERENCES public.tasking_candidates(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.approved_tasking_plans
    ADD CONSTRAINT approved_tasking_plans_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.desk_check_decisions
    ADD CONSTRAINT desk_check_decisions_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.tasking_candidates(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.desk_check_decisions
    ADD CONSTRAINT desk_check_decisions_decided_by_user_id_fkey FOREIGN KEY (decided_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.desk_check_decisions
    ADD CONSTRAINT desk_check_decisions_iteration_id_fkey FOREIGN KEY (iteration_id) REFERENCES public.iterations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.desk_check_decisions
    ADD CONSTRAINT desk_check_decisions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.diagram_edges
    ADD CONSTRAINT diagram_edges_diagram_id_fkey FOREIGN KEY (diagram_id) REFERENCES public.diagrams(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.diagram_nodes
    ADD CONSTRAINT diagram_nodes_diagram_id_fkey FOREIGN KEY (diagram_id) REFERENCES public.diagrams(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.diagrams
    ADD CONSTRAINT diagrams_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.inbox_candidate_decisions
    ADD CONSTRAINT inbox_candidate_decisions_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.inbox_story_candidates(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.inbox_candidate_decisions
    ADD CONSTRAINT inbox_candidate_decisions_decided_by_user_id_fkey FOREIGN KEY (decided_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.inbox_candidate_decisions
    ADD CONSTRAINT inbox_candidate_decisions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.inbox_extraction_sources
    ADD CONSTRAINT inbox_extraction_sources_extraction_id_fkey FOREIGN KEY (extraction_id) REFERENCES public.inbox_extractions(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.inbox_extraction_sources
    ADD CONSTRAINT inbox_extraction_sources_inbox_item_id_fkey FOREIGN KEY (inbox_item_id) REFERENCES public.inbox_items(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.inbox_extraction_sources
    ADD CONSTRAINT inbox_extraction_sources_inbox_revision_id_fkey FOREIGN KEY (inbox_revision_id) REFERENCES public.inbox_revisions(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.inbox_extractions
    ADD CONSTRAINT inbox_extractions_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.inbox_extractions
    ADD CONSTRAINT inbox_extractions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.inbox_items
    ADD CONSTRAINT inbox_items_latest_revision_id_fkey FOREIGN KEY (latest_revision_id) REFERENCES public.inbox_revisions(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.inbox_items
    ADD CONSTRAINT inbox_items_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.inbox_revisions
    ADD CONSTRAINT inbox_revisions_inbox_item_id_fkey FOREIGN KEY (inbox_item_id) REFERENCES public.inbox_items(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.inbox_story_candidates
    ADD CONSTRAINT inbox_story_candidates_extraction_id_fkey FOREIGN KEY (extraction_id) REFERENCES public.inbox_extractions(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.inbox_story_candidates
    ADD CONSTRAINT inbox_story_candidates_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.inbox_story_citations
    ADD CONSTRAINT inbox_story_citations_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.inbox_story_candidates(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.inbox_story_citations
    ADD CONSTRAINT inbox_story_citations_inbox_item_id_fkey FOREIGN KEY (inbox_item_id) REFERENCES public.inbox_items(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.inbox_story_citations
    ADD CONSTRAINT inbox_story_citations_inbox_revision_id_fkey FOREIGN KEY (inbox_revision_id) REFERENCES public.inbox_revisions(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.iteration_intakes
    ADD CONSTRAINT iteration_intakes_iteration_id_fkey FOREIGN KEY (iteration_id) REFERENCES public.iterations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.iterations
    ADD CONSTRAINT iterations_admitted_by_user_id_fkey FOREIGN KEY (admitted_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.iterations
    ADD CONSTRAINT iterations_source_candidate_id_fkey FOREIGN KEY (source_candidate_id) REFERENCES public.inbox_story_candidates(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.iterations
    ADD CONSTRAINT iterations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.kickoff_decisions
    ADD CONSTRAINT kickoff_decisions_decided_by_user_id_fkey FOREIGN KEY (decided_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.kickoff_decisions
    ADD CONSTRAINT kickoff_decisions_iteration_id_fkey FOREIGN KEY (iteration_id) REFERENCES public.iterations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.kickoff_decisions
    ADD CONSTRAINT kickoff_decisions_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.kickoff_proposals(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.kickoff_proposals
    ADD CONSTRAINT kickoff_proposals_iteration_id_fkey FOREIGN KEY (iteration_id) REFERENCES public.iterations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.logical_entities
    ADD CONSTRAINT logical_entities_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.logical_relationships
    ADD CONSTRAINT logical_relationships_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.no_model_impact_decisions
    ADD CONSTRAINT no_model_impact_decisions_decided_by_user_id_fkey FOREIGN KEY (decided_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.no_model_impact_decisions
    ADD CONSTRAINT no_model_impact_decisions_iteration_id_fkey FOREIGN KEY (iteration_id) REFERENCES public.iterations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.no_model_impact_decisions
    ADD CONSTRAINT no_model_impact_decisions_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.no_model_impact_decisions
    ADD CONSTRAINT no_model_impact_decisions_story_revision_id_fkey FOREIGN KEY (story_revision_id) REFERENCES public.story_revisions(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.no_model_impact_decisions
    ADD CONSTRAINT no_model_impact_decisions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.pair_automation_exceptions
    ADD CONSTRAINT pair_automation_exceptions_pair_run_id_fkey FOREIGN KEY (pair_run_id) REFERENCES public.pair_runs(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.pair_coding_decisions
    ADD CONSTRAINT pair_coding_decisions_decided_by_user_id_fkey FOREIGN KEY (decided_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.pair_coding_decisions
    ADD CONSTRAINT pair_coding_decisions_pair_run_id_fkey FOREIGN KEY (pair_run_id) REFERENCES public.pair_runs(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.pair_command_observations
    ADD CONSTRAINT pair_command_observations_pair_run_id_fkey FOREIGN KEY (pair_run_id) REFERENCES public.pair_runs(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.pair_driver_attempts
    ADD CONSTRAINT pair_driver_attempts_pair_run_id_fkey FOREIGN KEY (pair_run_id) REFERENCES public.pair_runs(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.pair_execution_manifests
    ADD CONSTRAINT pair_execution_manifests_pair_run_id_fkey FOREIGN KEY (pair_run_id) REFERENCES public.pair_runs(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.pair_red_reviews
    ADD CONSTRAINT pair_red_reviews_observation_id_fkey FOREIGN KEY (observation_id) REFERENCES public.pair_command_observations(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.pair_red_reviews
    ADD CONSTRAINT pair_red_reviews_pair_run_id_fkey FOREIGN KEY (pair_run_id) REFERENCES public.pair_runs(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.pair_runs
    ADD CONSTRAINT pair_runs_approved_tasking_plan_id_fkey FOREIGN KEY (approved_tasking_plan_id) REFERENCES public.approved_tasking_plans(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.pair_runs
    ADD CONSTRAINT pair_runs_iteration_id_fkey FOREIGN KEY (iteration_id) REFERENCES public.iterations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.pair_runs
    ADD CONSTRAINT pair_runs_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.pair_runs
    ADD CONSTRAINT pair_runs_story_revision_id_fkey FOREIGN KEY (story_revision_id) REFERENCES public.story_revisions(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.pair_runs
    ADD CONSTRAINT pair_runs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.problem_statement_revisions
    ADD CONSTRAINT problem_statement_revisions_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.respond_candidates
    ADD CONSTRAINT respond_candidates_iteration_id_fkey FOREIGN KEY (iteration_id) REFERENCES public.iterations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.respond_candidates
    ADD CONSTRAINT respond_candidates_showcase_decision_id_fkey FOREIGN KEY (showcase_decision_id) REFERENCES public.showcase_decisions(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.respond_candidates
    ADD CONSTRAINT respond_candidates_showcase_run_id_fkey FOREIGN KEY (showcase_run_id) REFERENCES public.showcase_runs(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.respond_candidates
    ADD CONSTRAINT respond_candidates_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.respond_candidates
    ADD CONSTRAINT respond_candidates_story_revision_id_fkey FOREIGN KEY (story_revision_id) REFERENCES public.story_revisions(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.respond_candidates
    ADD CONSTRAINT respond_candidates_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.respond_decisions
    ADD CONSTRAINT respond_decisions_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.respond_candidates(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.respond_decisions
    ADD CONSTRAINT respond_decisions_decided_by_user_id_fkey FOREIGN KEY (decided_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.scenario_drafts
    ADD CONSTRAINT scenario_drafts_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.scenario_set_proposals(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.scenario_set_proposals
    ADD CONSTRAINT scenario_set_proposals_iteration_id_fkey FOREIGN KEY (iteration_id) REFERENCES public.iterations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.scenario_set_proposals
    ADD CONSTRAINT scenario_set_proposals_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.scenario_set_proposals
    ADD CONSTRAINT scenario_set_proposals_story_revision_id_fkey FOREIGN KEY (story_revision_id) REFERENCES public.story_revisions(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.scenario_set_proposals
    ADD CONSTRAINT scenario_set_proposals_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.showcase_decisions
    ADD CONSTRAINT showcase_decisions_decided_by_user_id_fkey FOREIGN KEY (decided_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.showcase_decisions
    ADD CONSTRAINT showcase_decisions_showcase_run_id_fkey FOREIGN KEY (showcase_run_id) REFERENCES public.showcase_runs(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.showcase_evaluations
    ADD CONSTRAINT showcase_evaluations_observed_by_user_id_fkey FOREIGN KEY (observed_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.showcase_evaluations
    ADD CONSTRAINT showcase_evaluations_showcase_run_id_fkey FOREIGN KEY (showcase_run_id) REFERENCES public.showcase_runs(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.showcase_product_observations
    ADD CONSTRAINT showcase_product_observations_observed_by_user_id_fkey FOREIGN KEY (observed_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.showcase_product_observations
    ADD CONSTRAINT showcase_product_observations_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.story_scenarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.showcase_product_observations
    ADD CONSTRAINT showcase_product_observations_showcase_run_id_fkey FOREIGN KEY (showcase_run_id) REFERENCES public.showcase_runs(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.showcase_q2_observations
    ADD CONSTRAINT showcase_q2_observations_showcase_run_id_fkey FOREIGN KEY (showcase_run_id) REFERENCES public.showcase_runs(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.showcase_reviews
    ADD CONSTRAINT showcase_reviews_showcase_run_id_fkey FOREIGN KEY (showcase_run_id) REFERENCES public.showcase_runs(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.showcase_risk_decisions
    ADD CONSTRAINT showcase_risk_decisions_decided_by_user_id_fkey FOREIGN KEY (decided_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.showcase_risk_decisions
    ADD CONSTRAINT showcase_risk_decisions_showcase_run_id_fkey FOREIGN KEY (showcase_run_id) REFERENCES public.showcase_runs(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.showcase_runs
    ADD CONSTRAINT showcase_runs_approved_tasking_plan_id_fkey FOREIGN KEY (approved_tasking_plan_id) REFERENCES public.approved_tasking_plans(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.showcase_runs
    ADD CONSTRAINT showcase_runs_iteration_id_fkey FOREIGN KEY (iteration_id) REFERENCES public.iterations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.showcase_runs
    ADD CONSTRAINT showcase_runs_pair_manifest_id_fkey FOREIGN KEY (pair_manifest_id) REFERENCES public.pair_execution_manifests(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.showcase_runs
    ADD CONSTRAINT showcase_runs_pair_run_id_fkey FOREIGN KEY (pair_run_id) REFERENCES public.pair_runs(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.showcase_runs
    ADD CONSTRAINT showcase_runs_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.showcase_runs
    ADD CONSTRAINT showcase_runs_story_revision_id_fkey FOREIGN KEY (story_revision_id) REFERENCES public.story_revisions(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.showcase_runs
    ADD CONSTRAINT showcase_runs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT stories_iteration_id_fkey FOREIGN KEY (iteration_id) REFERENCES public.iterations(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT stories_latest_revision_id_fkey FOREIGN KEY (latest_revision_id) REFERENCES public.story_revisions(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT stories_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.story_card_revisions
    ADD CONSTRAINT story_card_revisions_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.story_clarifications
    ADD CONSTRAINT story_clarifications_answered_by_user_id_fkey FOREIGN KEY (answered_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.story_clarifications
    ADD CONSTRAINT story_clarifications_iteration_id_fkey FOREIGN KEY (iteration_id) REFERENCES public.iterations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.story_clarifications
    ADD CONSTRAINT story_clarifications_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.story_clarifications
    ADD CONSTRAINT story_clarifications_story_revision_id_fkey FOREIGN KEY (story_revision_id) REFERENCES public.story_revisions(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.story_clarifications
    ADD CONSTRAINT story_clarifications_waived_by_user_id_fkey FOREIGN KEY (waived_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.story_clarifications
    ADD CONSTRAINT story_clarifications_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.story_revision_citations
    ADD CONSTRAINT story_revision_citations_inbox_revision_id_fkey FOREIGN KEY (inbox_revision_id) REFERENCES public.inbox_revisions(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.story_revision_citations
    ADD CONSTRAINT story_revision_citations_story_revision_id_fkey FOREIGN KEY (story_revision_id) REFERENCES public.story_revisions(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.story_revisions
    ADD CONSTRAINT story_revisions_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.story_revisions
    ADD CONSTRAINT story_revisions_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.story_revisions
    ADD CONSTRAINT story_revisions_understanding_decision_id_fkey FOREIGN KEY (understanding_decision_id) REFERENCES public.understanding_decisions(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.story_scenarios
    ADD CONSTRAINT story_scenarios_source_draft_id_fkey FOREIGN KEY (source_draft_id) REFERENCES public.scenario_drafts(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.story_scenarios
    ADD CONSTRAINT story_scenarios_story_revision_id_fkey FOREIGN KEY (story_revision_id) REFERENCES public.story_revisions(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.story_scenarios
    ADD CONSTRAINT story_scenarios_understanding_decision_id_fkey FOREIGN KEY (understanding_decision_id) REFERENCES public.understanding_decisions(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.tasking_candidates
    ADD CONSTRAINT tasking_candidates_iteration_id_fkey FOREIGN KEY (iteration_id) REFERENCES public.iterations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.tasking_candidates
    ADD CONSTRAINT tasking_candidates_no_model_impact_decision_id_fkey FOREIGN KEY (no_model_impact_decision_id) REFERENCES public.no_model_impact_decisions(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.tasking_candidates
    ADD CONSTRAINT tasking_candidates_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.tasking_candidates
    ADD CONSTRAINT tasking_candidates_story_revision_id_fkey FOREIGN KEY (story_revision_id) REFERENCES public.story_revisions(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.tasking_candidates
    ADD CONSTRAINT tasking_candidates_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.understanding_decisions
    ADD CONSTRAINT understanding_decisions_decided_by_user_id_fkey FOREIGN KEY (decided_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.understanding_decisions
    ADD CONSTRAINT understanding_decisions_iteration_id_fkey FOREIGN KEY (iteration_id) REFERENCES public.iterations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.understanding_decisions
    ADD CONSTRAINT understanding_decisions_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.scenario_set_proposals(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.understanding_decisions
    ADD CONSTRAINT understanding_decisions_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.understanding_decisions
    ADD CONSTRAINT understanding_decisions_story_revision_id_fkey FOREIGN KEY (story_revision_id) REFERENCES public.story_revisions(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.understanding_decisions
    ADD CONSTRAINT understanding_decisions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.user_identities
    ADD CONSTRAINT user_identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.workspace_memberships
    ADD CONSTRAINT workspace_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.workspace_memberships
    ADD CONSTRAINT workspace_memberships_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.workspace_sequences
    ADD CONSTRAINT workspace_sequences_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;
