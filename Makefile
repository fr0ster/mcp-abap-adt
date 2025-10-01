# Detect OS
ifeq ($(OS),Windows_NT)
	# Windows
	MKDIR = if not exist $(1) mkdir $(1)
	RMDIR = if exist $(1) rmdir /s /q $(1)
	RM = if exist $(1) del /q $(1)
	SEP = \\
	PATH_SEP = ;
else
	# Unix-like (Linux, macOS)
	MKDIR = mkdir -p $(1)
	RMDIR = rm -rf $(1)
	RM = rm -f $(1)
	SEP = /
	PATH_SEP = :
endif

# Default target - just build TypeScript
.PHONY: all
all: build

# Build TypeScript (main build target)
.PHONY: build
build:
	@echo "Building TypeScript..."
	@tsc -p tsconfig.json
	@echo "Build completed"

# Clean generated files
.PHONY: clean
clean:
	@echo "Cleaning generated files..."
	@$(call RMDIR,dist)
	@echo "Clean completed"

# Development workflow
.PHONY: dev
dev: build
	@npm run dev

# Test
.PHONY: test
test: build
	@npm test

# Install dependencies
.PHONY: install
install:
	@npm install

# Help
.PHONY: help
help:
	@echo "Available targets:"
	@echo "  all        - Build TypeScript (default)"
	@echo "  build      - Build TypeScript (main target)"
	@echo "  clean      - Clean build files"
	@echo "  dev        - Build and run in development mode"
	@echo "  test       - Build and run tests"
	@echo "  install    - Install npm dependencies"
	@echo "  help       - Show this help"
	@echo ""
	@echo "Detected OS: $(if $(filter Windows_NT,$(OS)),Windows,Unix-like)"
