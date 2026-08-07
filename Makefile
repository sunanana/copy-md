.DEFAULT_GOAL := help

# 拡張本体としてパッケージに含めるもの。
# README / CONTRIBUTING / PRIVACY / docs / Makefile は配布物に不要なので入れない。
SOURCES := manifest.json \
           background.js \
           injected.js \
           sources.js \
           settings.js \
           spinner.js \
           options.html options.js options.css \
           popup.html popup.js popup.css \
           icons

VERSION := $(shell sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' manifest.json)
DIST    := dist
ZIP     := $(DIST)/copy-md-$(VERSION).zip

help: ## ヘルプメッセージ表示
	@echo "Makefile Commands"
	@echo ""
	@# Primary commands (no slash)
	@primary_commands=$$(grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | grep -v '/'); \
	if [ -n "$$primary_commands" ]; then \
		echo "$$primary_commands" | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "%-20s %s\n", $$1, $$2}'; \
		echo ""; \
	fi
	@# Hierarchical commands (with slash) - group by prefix
	@grep -E '^[a-zA-Z_-]+/[a-zA-Z_/-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	sort | \
	awk 'BEGIN {FS = ":.*?## "; current_group = ""} \
	{ \
		split($$1, parts, "/"); \
		group = parts[1]; \
		if (group != current_group) { \
			if (current_group != "") print ""; \
			printf "\033[32m%s:\033[0m\n", group; \
			current_group = group; \
		} \
		printf "  %-20s %s\n", $$1, $$2; \
	}'

zip: check ## ストア提出用の ZIP を dist/ に作成
	@mkdir -p $(DIST)
	@rm -f $(ZIP)
	@zip -q -r -X $(ZIP) $(SOURCES) -x '*.DS_Store' -x '__MACOSX/*' -x '_metadata/*'
	@echo "created: $(ZIP)"
	@unzip -l $(ZIP)

check: ## パッケージ対象のファイルが揃っているか検査
	@missing=""; \
	for f in $(SOURCES); do \
		[ -e "$$f" ] || missing="$$missing $$f"; \
	done; \
	if [ -n "$$missing" ]; then echo "missing:$$missing"; exit 1; fi
	@test -n "$(VERSION)" || { echo "manifest.json から version を読み取れません"; exit 1; }
	@echo "version: $(VERSION)"

version: ## manifest.json のバージョンを表示
	@echo $(VERSION)

clean: ## dist/ を削除
	@rm -rf $(DIST)
	@echo "removed: $(DIST)"

.PHONY: help zip check version clean
