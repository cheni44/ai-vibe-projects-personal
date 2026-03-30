## ADDED Requirements

### Requirement: Static site files in mosquito-detector-web/ directory
The system SHALL contain all web app source files (`index.html`, `app.js`, `style.css`) inside a `mosquito-detector-web/` directory at the repository root, with no build step required to view them locally (open `index.html` in a browser or serve with any static file server).

#### Scenario: Local preview without build
- **WHEN** a developer runs `npx serve mosquito-detector-web` or opens `index.html` via `localhost`
- **THEN** the full app SHALL load and function correctly (camera access requires HTTPS or localhost)

### Requirement: GitHub Actions deployment workflow
The system SHALL include a GitHub Actions workflow file at `.github/workflows/deploy-web.yml` that triggers on every push to `main`, copies the `mosquito-detector-web/` directory contents to the `gh-pages` branch using the official `actions/deploy-pages` action, and sets the correct base path.

#### Scenario: Push to main triggers deployment
- **WHEN** a commit is pushed to the `main` branch
- **THEN** the GitHub Actions workflow SHALL run, build the Pages artifact from `mosquito-detector-web/`, and deploy it to GitHub Pages

#### Scenario: Deployment succeeds without manual steps
- **WHEN** the workflow completes successfully
- **THEN** the app SHALL be accessible at `https://<owner>.github.io/<repo>/` with no further manual configuration beyond enabling Pages in repo settings

### Requirement: GitHub Pages configuration documentation
The system SHALL include instructions in `mosquito-detector-web/README.md` for enabling GitHub Pages (Settings → Pages → Source: GitHub Actions) so a new contributor can activate the site in under 5 minutes.

#### Scenario: README covers Pages setup
- **WHEN** a user follows the README instructions
- **THEN** they SHALL be able to enable GitHub Pages and access the live URL without opening any other documentation
