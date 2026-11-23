# Your Article Hub

A GitHub-only community journal. Readers visit GitHub Pages. Contributors sign in to GitHub, use the Discussions editor and can publish immediately. GitHub stores images and article content. GitHub Actions regenerates the public journal after discussion changes, with a scheduled refresh for category updates.

## Repository setup

1. Create a public repository under your GitHub account. Push these files to the default `main` branch.
2. In repository **Settings → General → Features**, enable **Discussions**. Open Discussions and create the topic categories you want. Use the open discussion format for posting. GitHub controls who can post and manage content using repository roles.
3. In **Settings → Pages → Build and deployment**, select **GitHub Actions**. On the **Actions** tab, run **Publish Article Hub**. The run reports the Pages link.
4. Keep repository admin access with your GitHub account and delegate repository roles only as needed. Use **Discussions → Categories** to manage topics. Use each discussion's menu to edit, delete, or moderate posts, subject to GitHub's repository role permissions.

Contributors add a title and place the description in the first paragraph. The GitHub Markdown editor supports images, links, headings and lists. The editor uses GitHub's normal formatting controls, so there is no dedicated article-alignment toolbar or standalone description input.

## Local layout preview

With Node.js 24, run `node build.mjs OWNER/REPOSITORY --preview` from this folder. Open `_site/index.html`. This generates an empty journal for layout preview. Production uses the GitHub Actions token to read discussions.

