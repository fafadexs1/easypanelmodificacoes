# Plane - Project Management Script

This directory contains the Plane project management tool deployment for Easypanel.

## Update Process

To update Plane to the latest version, follow these steps in order:

### Step 1: Run the Setup Script for Upgrade

First, run the `setup.sh` script and choose the upgrade option:

```
./setup.sh
```

When prompted, select option **5** for "Upgrade". This will:

*   Check for the latest available release
*   Download the latest stable version

### Step 2: Run the Update Script

After the setup script completes successfully, run the `update.js` script:

```
node update.js
```

This script will:

*   Removes the existing code directory and changes the name for the newly fetched directory to code. 
*   Rename `plane.env` to `.env.example`
*   Rename `docker-compose.yaml` to `docker-compose.yml`
*   Remove container names and ports from docker-compose.yml
*   Update environment variables to use Easypanel's `PRIMARY_DOMAIN` variable

## Important Notes

*   **Always run setup.sh first** - This ensures you get the latest official Plane release
*   **Then run update.js** - This applies Easypanel-specific customizations
*   The update process will preserve your existing data and configuration