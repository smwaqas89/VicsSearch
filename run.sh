#!/bin/bash
# Run DocSearch with proper Python path
cd "$(dirname "$0")"
export PYTHONPATH="$PWD/src:$PYTHONPATH"
python -m docsearch.cli.main "$@"
