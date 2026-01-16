This extension makes the skills available in gemini-cli. It exposes a tool that walks the the plugins directory in the original repo and lists all skills available, as well as a tool to install individual skills by copying them into `~/.gemini/skills/`

```
cd gemini-extension/mcp-server
npm install
gemini extensions link ../
```

In gemini-cli:

```
/tob-skills-list
/tob-skills-install testing-handbook-skills-coverage-analysis
/skills reload
```
