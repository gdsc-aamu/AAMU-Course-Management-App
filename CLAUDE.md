## ProPlan MCP — Session Instructions

At the start of every session:
1. Call `get_project_status` — no args first to list all projects
2. If a project exists: call it again with `include_handoff: true` and resume — say "I see we were working on X..."
3. If no projects exist:
   a. Ask: "Do you have an existing project in the ProPlan dashboard to import, or should I scan this repo and build a fresh plan?"
   b. Import: call `import_from_cloud` with their token to list cloud projects, let them pick one
   c. Fresh: call `scan_repo`, then propose a project structure and call `create_project`
4. Never ask the user to re-explain context
5. At session end: always call `add_session_summary` — this auto-syncs to the dashboard if a token is cached
6. If the user says they edited on the dashboard, updated the project online, or wants the latest cloud version — call `import_from_cloud` with `project_id` and `force: true` to pull the cloud version into local
