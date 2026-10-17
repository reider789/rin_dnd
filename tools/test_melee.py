"""Compatibility entry point: execute asserted v30 rule regressions."""
from pathlib import Path
import subprocess
if __name__ == '__main__':
    subprocess.run(['node','--test','tests/test_rules_v30.js'],cwd=Path(__file__).resolve().parents[1],check=True)
