#!/bin/bash
# Generate version statistics report
# Usage: ./tools/version-stats.sh [count]
#   count - number of versions to show (default: 20)

COUNT=${1:-20}

echo "# Version Statistics Report"
echo ""
echo "Generated: $(date '+%Y-%m-%d %H:%M')"
echo ""

# Get all version tags (supports v*.*.* pattern)
TAGS=$(git tag -l 'v*' --sort=-version:refname | head -$COUNT)

if [ -z "$TAGS" ]; then
    echo "No version tags found."
    exit 0
fi

echo "| Version | Date | Commits | Files | Insertions | Deletions |"
echo "|---------|------|---------|-------|------------|-----------|"

TOTAL_COMMITS=0
TOTAL_INSERTIONS=0
TOTAL_DELETIONS=0

for tag in $TAGS; do
    prev=$(git describe --tags --abbrev=0 "$tag^" 2>/dev/null || echo "")
    if [ -n "$prev" ]; then
        # Get commit count
        commits=$(git log --oneline "$prev..$tag" 2>/dev/null | wc -l | tr -d ' ')

        # Get date
        date=$(git log -1 --format="%cs" "$tag" 2>/dev/null)

        # Get diff stats
        stats=$(git diff --shortstat "$prev..$tag" 2>/dev/null)

        files=$(echo "$stats" | grep -oE '[0-9]+ files?' | grep -oE '[0-9]+' || echo "0")
        insertions=$(echo "$stats" | grep -oE '[0-9]+ insertion' | grep -oE '[0-9]+' || echo "0")
        deletions=$(echo "$stats" | grep -oE '[0-9]+ deletion' | grep -oE '[0-9]+' || echo "0")

        # Handle empty values
        files=${files:-0}
        insertions=${insertions:-0}
        deletions=${deletions:-0}

        # Accumulate totals
        TOTAL_COMMITS=$((TOTAL_COMMITS + commits))
        TOTAL_INSERTIONS=$((TOTAL_INSERTIONS + insertions))
        TOTAL_DELETIONS=$((TOTAL_DELETIONS + deletions))

        # Format with highlighting for big releases
        if [ "$insertions" -gt 10000 ]; then
            echo "| **$tag** 🔥 | $date | $commits | $files | +$insertions | -$deletions |"
        elif [ "$insertions" -gt 1000 ]; then
            echo "| **$tag** | $date | $commits | $files | +$insertions | -$deletions |"
        else
            echo "| $tag | $date | $commits | $files | +$insertions | -$deletions |"
        fi
    fi
done

echo ""
echo "## Summary"
echo ""

# Date range
first_date=$(git log --format="%cs" $(echo "$TAGS" | tail -1) -1 2>/dev/null)
last_date=$(git log --format="%cs" $(echo "$TAGS" | head -1) -1 2>/dev/null)

echo "- 📅 Period: **$first_date → $last_date**"
echo "- 📝 Total commits: **$TOTAL_COMMITS**"
echo "- 📈 Lines added: **+$TOTAL_INSERTIONS**"
echo "- 📉 Lines removed: **-$TOTAL_DELETIONS**"
echo "- 📊 Net change: **$((TOTAL_INSERTIONS - TOTAL_DELETIONS))** lines"
