/**
 * AI Assistant Core - Claude & Gemini Integration
 * A Paul Phillips Manifestation - Paul@clearseassolutions.com
 * "The Revolution Will Not be in a Structured Format" © 2025
 */

const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs-extra');
const path = require('path');

class AIAssistant {
    constructor(config = {}) {
        this.config = config;
        this.conversationHistory = [];

        // Initialize Claude
        if (config.claudeApiKey) {
            this.claude = new Anthropic({
                apiKey: config.claudeApiKey
            });
        }

        // Initialize Gemini
        if (config.geminiApiKey) {
            this.gemini = new GoogleGenerativeAI(config.geminiApiKey);
            this.geminiModel = this.gemini.getGenerativeModel({
                model: 'gemini-pro',
                generationConfig: {
                    temperature: 0.7,
                    topP: 0.8,
                    topK: 40,
                    maxOutputTokens: 2048,
                }
            });
        }

        this.systemPrompt = this.buildSystemPrompt();
    }

    buildSystemPrompt() {
        const experienceLevel = this.config.experienceLevel || 'beginner';

        const prompts = {
            beginner: `You are a patient, encouraging coding mentor helping someone new to programming and cloud deployment.

Your guidelines:
- Use simple, everyday language - avoid jargon
- When you must use technical terms, explain them immediately
- Break complex topics into tiny, manageable steps
- Encourage and reassure - learning to code is hard!
- Give concrete examples, not abstract concepts
- Always explain WHY, not just WHAT
- Anticipate confusion and address it preemptively
- Celebrate small wins

When explaining errors:
1. Say what went wrong in plain English
2. Explain why it happened
3. Show exactly how to fix it
4. Explain how to prevent it next time

Remember: There are no stupid questions. Every expert was once a beginner.`,

            intermediate: `You are an experienced senior developer mentoring a growing programmer.

Your approach:
- Provide clear, practical guidance
- Explain the reasoning behind best practices
- Suggest multiple approaches when relevant
- Point out common pitfalls
- Share industry standards
- Balance theory with practical application
- Encourage good habits early

Focus on:
- Best practices and why they matter
- Security considerations
- Performance implications
- Scalability concerns
- Maintainability

You can use technical terms, but ensure concepts are clear.`,

            advanced: `You are a distinguished software architect and cloud expert.

Your role:
- Provide expert-level insights
- Discuss architectural trade-offs
- Reference advanced patterns and practices
- Analyze performance and cost implications
- Consider enterprise-scale concerns
- Share cutting-edge techniques
- Challenge assumptions constructively

Topics to cover:
- Architecture patterns
- Distributed systems concerns
- Security at depth
- Cost optimization strategies
- Performance profiling
- CI/CD best practices
- Infrastructure as Code

Be precise, comprehensive, and assume strong technical foundation.`
        };

        return prompts[experienceLevel] || prompts.beginner;
    }

    async ask(question, context = {}) {
        const provider = this.config.preferredProvider || this.detectBestProvider(question);

        if (provider === 'claude' && this.claude) {
            return await this.askClaude(question, context);
        } else if (provider === 'gemini' && this.geminiModel) {
            return await this.askGemini(question, context);
        } else if (this.claude) {
            return await this.askClaude(question, context);
        } else if (this.geminiModel) {
            return await this.askGemini(question, context);
        } else {
            throw new Error('No AI provider configured. Please add API keys in setup.');
        }
    }

    detectBestProvider(question) {
        // Claude is better for: explanations, debugging, complex reasoning
        // Gemini is better for: quick answers, code generation, patterns

        const claudeKeywords = ['explain', 'why', 'how does', 'understand', 'debug', 'error'];
        const geminiKeywords = ['generate', 'create', 'quick', 'code', 'example'];

        const questionLower = question.toLowerCase();

        const claudeScore = claudeKeywords.filter(k => questionLower.includes(k)).length;
        const geminiScore = geminiKeywords.filter(k => questionLower.includes(k)).length;

        return claudeScore > geminiScore ? 'claude' : 'gemini';
    }

    async askClaude(question, context = {}) {
        try {
            const messages = [
                ...this.conversationHistory,
                {
                    role: 'user',
                    content: this.formatQuestion(question, context)
                }
            ];

            const response = await this.claude.messages.create({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 4096,
                system: this.systemPrompt,
                messages: messages
            });

            const assistantMessage = response.content[0].text;

            // Store in conversation history
            this.conversationHistory.push(
                { role: 'user', content: question },
                { role: 'assistant', content: assistantMessage }
            );

            // Keep history manageable (last 10 exchanges)
            if (this.conversationHistory.length > 20) {
                this.conversationHistory = this.conversationHistory.slice(-20);
            }

            return {
                provider: 'claude',
                response: assistantMessage,
                model: 'claude-3-5-sonnet-20241022'
            };

        } catch (error) {
            console.error('Claude API error:', error);

            if (error.status === 401) {
                throw new Error('Invalid Claude API key. Run "nimbus setup" to update your keys.');
            }

            throw new Error(`Claude API error: ${error.message}`);
        }
    }

    async askGemini(question, context = {}) {
        try {
            const prompt = `${this.systemPrompt}\n\nUser Question: ${this.formatQuestion(question, context)}`;

            const result = await this.geminiModel.generateContent(prompt);
            const response = result.response;
            const assistantMessage = response.text();

            // Store in conversation history
            this.conversationHistory.push(
                { role: 'user', content: question },
                { role: 'assistant', content: assistantMessage }
            );

            // Keep history manageable
            if (this.conversationHistory.length > 20) {
                this.conversationHistory = this.conversationHistory.slice(-20);
            }

            return {
                provider: 'gemini',
                response: assistantMessage,
                model: 'gemini-pro'
            };

        } catch (error) {
            console.error('Gemini API error:', error);

            if (error.message.includes('API key')) {
                throw new Error('Invalid Gemini API key. Run "nimbus setup" to update your keys.');
            }

            throw new Error(`Gemini API error: ${error.message}`);
        }
    }

    formatQuestion(question, context) {
        let formatted = question;

        if (context.projectInfo) {
            formatted += `\n\nProject Context:\n${JSON.stringify(context.projectInfo, null, 2)}`;
        }

        if (context.errorMessage) {
            formatted += `\n\nError Message:\n${context.errorMessage}`;
        }

        if (context.codeSnippet) {
            formatted += `\n\nRelevant Code:\n\`\`\`\n${context.codeSnippet}\n\`\`\``;
        }

        if (context.fileContext) {
            formatted += `\n\nFile Context:\n${context.fileContext}`;
        }

        return formatted;
    }

    async explainIssue(issue, projectContext = {}) {
        const question = `I found this issue in my project: ${issue.message}

Category: ${issue.category}
Severity: ${issue.severity}
${issue.file ? `File: ${issue.file}` : ''}

Can you:
1. Explain what this means in simple terms
2. Why is this a problem?
3. Show me exactly how to fix it
4. How can I prevent this in the future?`;

        return await this.ask(question, { projectInfo: projectContext });
    }

    async debugError(errorMessage, stackTrace = '', codeContext = '') {
        const question = `I'm getting this error and I don't understand what's happening:

Error: ${errorMessage}
${stackTrace ? `\nStack Trace:\n${stackTrace}` : ''}

Can you help me understand what went wrong and how to fix it?`;

        return await this.ask(question, {
            errorMessage,
            codeSnippet: codeContext
        });
    }

    async generateSolution(problem, constraints = {}) {
        const question = `I need help solving this problem: ${problem}

${constraints.language ? `Language: ${constraints.language}` : ''}
${constraints.framework ? `Framework: ${constraints.framework}` : ''}
${constraints.requirements ? `Requirements: ${constraints.requirements}` : ''}

Can you provide:
1. A clear solution approach
2. Working code example
3. Explanation of how it works
4. Best practices to follow`;

        return await this.ask(question, { projectInfo: constraints });
    }

    async teachConcept(concept, depth = 'beginner') {
        const questions = {
            beginner: `Teach me about ${concept} as if I'm completely new to this.

Please:
1. Start with the absolute basics
2. Use everyday analogies
3. Build up step by step
4. Give simple examples I can try
5. Explain why this matters`,

            intermediate: `Explain ${concept} with practical examples.

Please cover:
1. Core concepts and principles
2. Common use cases
3. Best practices
4. Common mistakes to avoid
5. Practical code examples`,

            advanced: `Provide an in-depth explanation of ${concept}.

Please discuss:
1. Advanced concepts and patterns
2. Implementation details
3. Trade-offs and considerations
4. Performance implications
5. Enterprise-scale concerns`
        };

        return await this.ask(questions[depth] || questions.beginner);
    }

    async reviewCode(code, language = 'javascript') {
        const question = `Please review this ${language} code:

\`\`\`${language}
${code}
\`\`\`

Please provide:
1. Code quality assessment
2. Potential bugs or issues
3. Security concerns
4. Performance optimization suggestions
5. Best practice recommendations
6. Suggested improvements with examples`;

        return await this.ask(question, { codeSnippet: code });
    }

    async suggestFix(issue, currentCode = '') {
        const question = `I need to fix this issue: ${issue}

${currentCode ? `Current code:\n\`\`\`\n${currentCode}\n\`\`\`\n` : ''}

Please provide:
1. Explanation of the fix
2. Updated code
3. Why this solution works
4. Testing suggestions`;

        return await this.ask(question, { codeSnippet: currentCode });
    }

    async planDeployment(projectInfo) {
        const question = `I need help planning deployment for my project.

Project Details:
- Name: ${projectInfo.name}
- Platform: ${projectInfo.platform || 'Not specified'}
- Type: ${projectInfo.type || 'Web application'}

Please provide:
1. Step-by-step deployment plan
2. Prerequisites and requirements
3. Configuration checklist
4. Security considerations
5. Post-deployment verification steps
6. Common issues and solutions`;

        return await this.ask(question, { projectInfo });
    }

    clearHistory() {
        this.conversationHistory = [];
    }

    async saveConversation(filepath) {
        await fs.writeJson(filepath, {
            history: this.conversationHistory,
            savedAt: new Date().toISOString()
        }, { spaces: 2 });
    }

    async loadConversation(filepath) {
        const data = await fs.readJson(filepath);
        this.conversationHistory = data.history || [];
    }
}

module.exports = AIAssistant;