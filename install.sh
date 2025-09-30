#!/bin/bash

###
# Intelligent Cloud Guardian - Easy Installation Script
# A Paul Phillips Manifestation - Paul@clearseassolutions.com
# "The Revolution Will Not be in a Structured Format" © 2025
###

set -e

echo "🛡️  Installing Intelligent Cloud Guardian..."
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo "   Please install Node.js from: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js found: $(node --version)"

# Check for npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed!"
    exit 1
fi

echo "✅ npm found: $(npm --version)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed"
echo ""

# Make scripts executable
chmod +x cli.js
chmod +x setup.js
chmod +x dashboard-server.js

# Link globally
echo "🔗 Linking guardian command globally..."
npm link

if [ $? -ne 0 ]; then
    echo "❌ Failed to link globally. Try running with sudo:"
    echo "   sudo npm link"
    exit 1
fi

echo "✅ Guardian command linked successfully!"
echo ""

# Test installation
if command -v guardian &> /dev/null; then
    echo "✅ Installation successful!"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "🎉 Welcome to Intelligent Cloud Guardian!"
    echo ""
    echo "Get started in 3 steps:"
    echo ""
    echo "  1️⃣  guardian setup"
    echo "     → Quick setup wizard (2 minutes)"
    echo ""
    echo "  2️⃣  guardian dashboard"
    echo "     → Launch web dashboard"
    echo ""
    echo "  3️⃣  guardian chat"
    echo "     → Ask your AI assistant anything!"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "📚 Documentation:"
    echo "   • README.md - Full guide"
    echo "   • QUICKSTART.md - Get started fast"
    echo "   • FEATURES.md - Complete feature list"
    echo ""
    echo "💡 First time? Run: guardian setup"
    echo ""
else
    echo "⚠️  Installation completed but 'guardian' command not found"
    echo "   You may need to restart your terminal or add to PATH"
fi