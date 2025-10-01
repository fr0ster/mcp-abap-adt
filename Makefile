# ANTLR4 Configuration
ANTLR_VERSION = 4.13.1
ANTLR_JAR = antlr-$(ANTLR_VERSION)-complete.jar
ANTLR_URL = https://www.antlr.org/download/$(ANTLR_JAR)
ANTLR_DIR = tools/antlr
GRAMMAR_FILE = Abap.g4
GENERATED_DIR = src/generated
PARSER_PACKAGE = abap

# TypeScript Configuration
TSC = npx tsc
NODE_MODULES = node_modules
DIST_DIR = dist

# Default target
.PHONY: all
all: setup generate build

# Setup ANTLR4
.PHONY: setup
setup: $(ANTLR_DIR)/$(ANTLR_JAR)

$(ANTLR_DIR)/$(ANTLR_JAR):
	@echo "📦 Downloading ANTLR4 JAR..."
	@mkdir -p $(ANTLR_DIR)
	@curl -L $(ANTLR_URL) -o $(ANTLR_DIR)/$(ANTLR_JAR)
	@echo "✅ ANTLR4 JAR downloaded successfully"

# Generate parser from grammar
.PHONY: generate
generate: $(ANTLR_DIR)/$(ANTLR_JAR)
	@echo "🔧 Generating ANTLR4 parser..."
	@mkdir -p $(GENERATED_DIR)
	@java -jar $(ANTLR_DIR)/$(ANTLR_JAR) -Dlanguage=TypeScript -o $(GENERATED_DIR) -package $(PARSER_PACKAGE) $(GRAMMAR_FILE)
	@echo "✅ Parser generated successfully"

# Generate parser only if grammar changed
.PHONY: generate-if-needed
generate-if-needed: $(ANTLR_DIR)/$(ANTLR_JAR)
	@if [ ! -d "$(GENERATED_DIR)" ] || [ "$(GRAMMAR_FILE)" -nt "$(GENERATED_DIR)" ]; then \
		echo "🔧 Grammar changed, regenerating parser..."; \
		mkdir -p $(GENERATED_DIR); \
		java -jar $(ANTLR_DIR)/$(ANTLR_JAR) -Dlanguage=TypeScript -o $(GENERATED_DIR) -package $(PARSER_PACKAGE) $(GRAMMAR_FILE); \
		echo "✅ Parser regenerated successfully"; \
	else \
		echo "⏭️  Parser is up to date"; \
	fi

# Install npm dependencies
.PHONY: install
install:
	@echo "📦 Installing npm dependencies..."
	@npm install
	@echo "✅ Dependencies installed"

# Build TypeScript (without regenerating parser)
.PHONY: build-only
build-only:
	@echo "🔨 Building TypeScript..."
	@$(TSC) -p tsconfig.json
	@echo "✅ Build completed"

# Build with parser generation if needed
.PHONY: build
build: generate-if-needed build-only

# Full build (always regenerate parser)
.PHONY: build-full
build-full: generate build-only

# Development workflow
.PHONY: dev
dev: build
	@echo "🚀 Starting development server..."
	@npm run dev

# Test with parser generation
.PHONY: test
test: build
	@echo "🧪 Running tests..."
	@npm test

# Clean generated files (preserves ANTLR JAR)
.PHONY: clean
clean:
	@echo "🧹 Cleaning generated files..."
	@rm -rf $(GENERATED_DIR)
	@rm -rf $(DIST_DIR)
	@echo "✅ Clean completed"

# Clean everything including ANTLR JAR
.PHONY: clean-all
clean-all: clean
	@echo "🧹 Cleaning ANTLR JAR..."
	@rm -rf $(ANTLR_DIR)
	@echo "✅ Clean all completed"

# Reset project (clean + reinstall)
.PHONY: reset
reset: clean
	@echo "🔄 Resetting project..."
	@rm -rf $(NODE_MODULES)
	@npm install
	@$(MAKE) setup
	@echo "✅ Project reset completed"

# Watch for grammar changes and regenerate
.PHONY: watch-grammar
watch-grammar:
	@echo "👀 Watching for grammar changes..."
	@while true; do \
		$(MAKE) generate-if-needed; \
		sleep 2; \
	done

# Validate grammar syntax
.PHONY: validate-grammar
validate-grammar: $(ANTLR_DIR)/$(ANTLR_JAR)
	@echo "✅ Validating grammar syntax..."
	@java -jar $(ANTLR_DIR)/$(ANTLR_JAR) -Dlanguage=TypeScript $(GRAMMAR_FILE) -o /tmp/antlr-validation 2>/dev/null && echo "✅ Grammar is valid" || echo "❌ Grammar has syntax errors"
	@rm -rf /tmp/antlr-validation

# Show parser statistics
.PHONY: parser-stats
parser-stats: $(GENERATED_DIR)
	@echo "📊 Parser Statistics:"
	@echo "  Generated files: $$(find $(GENERATED_DIR) -name '*.ts' | wc -l)"
	@echo "  Total lines: $$(find $(GENERATED_DIR) -name '*.ts' -exec cat {} \; | wc -l)"
	@echo "  Grammar file size: $$(wc -c < $(GRAMMAR_FILE)) bytes"
	@echo "  Last generated: $$(stat -c %y $(GENERATED_DIR) 2>/dev/null || echo 'Never')"

# Help
.PHONY: help
help:
	@echo "🛠️  Available targets:"
	@echo ""
	@echo "  📦 Setup & Installation:"
	@echo "    setup              - Download ANTLR4 JAR"
	@echo "    install            - Install npm dependencies"
	@echo "    reset              - Clean and reinstall everything"
	@echo ""
	@echo "  🔧 Parser Generation:"
	@echo "    generate           - Generate parser from grammar (always)"
	@echo "    generate-if-needed - Generate parser only if grammar changed"
	@echo "    validate-grammar   - Check grammar syntax"
	@echo "    watch-grammar      - Watch for grammar changes"
	@echo ""
	@echo "  🔨 Building:"
	@echo "    build              - Generate parser if needed + build TypeScript"
	@echo "    build-full         - Always regenerate parser + build TypeScript"
	@echo "    build-only         - Build TypeScript without parser generation"
	@echo ""
	@echo "  🚀 Development:"
	@echo "    dev                - Build and run in development mode"
	@echo "    test               - Build and run tests"
	@echo ""
	@echo "  🧹 Cleanup:"
	@echo "    clean              - Clean generated files (preserve ANTLR JAR)"
	@echo "    clean-all          - Clean everything including ANTLR JAR"
	@echo ""
	@echo "  📊 Information:"
	@echo "    parser-stats       - Show parser generation statistics"
	@echo "    help               - Show this help"
	@echo ""
	@echo "  🎯 Common workflows:"
	@echo "    make all           - Complete setup and build"
	@echo "    make dev           - Quick development start"
	@echo "    make reset         - Start fresh"
