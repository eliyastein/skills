#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLUGINS_DIR = path.join(__dirname, "..", "..", "plugins");

function getGeminiSkillsDir() {
  return path.join(os.homedir(), ".gemini", "skills");
}

/**
 * Recursive directory walk
 */
function walkSync(dir, filelist = []) {
  if (!fs.existsSync(dir)) return filelist;
  
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filepath = path.join(dir, file);
    if (fs.statSync(filepath).isDirectory()) {
      filelist = walkSync(filepath, filelist);
    } else {
      filelist.push(filepath);
    }
  });
  return filelist;
}

function findSkills() {
  const skills = [];
  if (!fs.existsSync(PLUGINS_DIR)) {
    return skills;
  }

  // Find all SKILL.md files
  const allFiles = walkSync(PLUGINS_DIR);
  const skillFiles = allFiles.filter(f => path.basename(f) === "SKILL.md");

  for (const skillFile of skillFiles) {
    const root = path.dirname(skillFile);
    
    // Determine relative path from PLUGINS_DIR
    const relPath = path.relative(PLUGINS_DIR, root);
    const parts = relPath.split(path.sep);

    // Filter out 'skills' from the name parts
    const filteredParts = parts.filter(p => p !== "skills");

    // Deduplicate repeating parts
    const finalParts = [];
    if (filteredParts.length > 0) {
      finalParts.push(filteredParts[0]);
      for (let i = 1; i < filteredParts.length; i++) {
        if (filteredParts[i] !== finalParts[finalParts.length - 1]) {
          finalParts.push(filteredParts[i]);
        }
      }
    }

    const skillName = finalParts.join("-");

    // Read description
    let description = "No description available.";
    try {
      const content = fs.readFileSync(skillFile, "utf-8");
      // Extract description from yaml frontmatter
      const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
      if (match) {
        const yamlText = match[1];
        const descMatch = yamlText.match(/^description:\s*(>)?\s*(.+)$/m);
        if (descMatch) {
            if (descMatch[1] === ">") {
                // Multi-line description
                const lines = yamlText.split('\n');
                let capturing = false;
                let descLines = [];
                for (const line of lines) {
                    if (line.match(/^description:\s*>/)) {
                        capturing = true;
                        continue;
                    }
                    if (capturing) {
                        if (line.trim().length === 0) continue; 
                        if (line.startsWith('  ')) {
                            descLines.push(line.trim());
                        } else {
                            break;
                        }
                    }
                }
                description = descLines.join(" ");
            } else {
                 description = descMatch[2].trim();
            }
        }
      }
    } catch (e) {
      // Ignore errors
    }

    skills.push({
      name: skillName,
      path: root,
      description: description,
    });
  }

  // Sort by name
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

function handleListSkills() {
  const skills = findSkills();
  if (skills.length === 0) {
    return "No skills found in the plugins directory.";
  }

  const output = ["# Available Skills\n"];
  skills.forEach((s) => {
    // Put the skill name on its own line and the description on the next
    output.push(`- **${s.name}**:`);
    output.push(`  ${s.description}`);
  });
  return output.join("\n");
}

function handleInstallSkill(skillName) {
  const skills = findSkills();
  const targetSkill = skills.find(s => s.name === skillName);

  if (!targetSkill) {
    return `Error: Skill '${skillName}' not found.`;
  }

  const destBase = getGeminiSkillsDir();
  const destDir = path.join(destBase, skillName);

  if (fs.existsSync(destDir)) {
    return `Skill '${skillName}' is already installed at ${destDir}.`;
  }

  // Ensure destination base exists
  if (!fs.existsSync(destBase)) {
    try {
      fs.mkdirSync(destBase, { recursive: true });
    } catch (e) {
      return `Error creating skills directory: ${e}`;
    }
  }

  try {
    fs.cpSync(targetSkill.path, destDir, { recursive: true });
    return `Successfully installed '${skillName}' to ${destDir}.`;
  } catch (e) {
    return `Error installing skill: ${e}`;
  }
}

// Create server
const server = new Server(
  {
    name: "skills-marketplace",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_marketplace_skills",
        description: "List all available skills in the marketplace.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "install_marketplace_skill",
        description: "Install a skill from the marketplace.",
        inputSchema: {
          type: "object",
          properties: {
            skill_name: {
              type: "string",
              description: "Name of the skill to install",
            },
          },
          required: ["skill_name"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "list_marketplace_skills") {
    return {
      content: [{ type: "text", text: handleListSkills() }],
    };
  }

  if (name === "install_marketplace_skill") {
    const { skill_name } = args;
    if (!skill_name) {
       throw new Error("Missing required argument: skill_name");
    }
    return {
      content: [{ type: "text", text: handleInstallSkill(skill_name) }],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
