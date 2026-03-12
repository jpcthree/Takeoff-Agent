#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
VENV_DIR="$PROJECT_ROOT/.venv"
REQUIREMENTS="$PROJECT_ROOT/requirements.txt"

echo "=== Construction Takeoff Agent - Environment Setup ==="

# Check Python 3
if command -v python3 &>/dev/null; then
    PYTHON=python3
elif command -v python &>/dev/null && python --version 2>&1 | grep -q "Python 3"; then
    PYTHON=python
else
    echo "ERROR: Python 3 is required but not found."
    echo "Install Python 3.9+ from https://www.python.org/downloads/"
    exit 1
fi

PYTHON_VERSION=$($PYTHON --version 2>&1)
echo "Found: $PYTHON_VERSION"

# Create venv if it doesn't exist
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment at $VENV_DIR ..."
    $PYTHON -m venv "$VENV_DIR"
    echo "Virtual environment created."
else
    echo "Virtual environment already exists at $VENV_DIR"
fi

# Activate and install
source "$VENV_DIR/bin/activate"

echo "Installing/upgrading dependencies..."
pip install --upgrade pip --quiet
pip install -r "$REQUIREMENTS" --quiet

echo ""
echo "=== Setup Complete ==="
echo "Python: $(python --version)"
echo "Pip packages installed:"
pip list --format=columns | grep -E "PyMuPDF|openpyxl|Pillow"
echo ""
echo "To activate manually: source $VENV_DIR/bin/activate"
