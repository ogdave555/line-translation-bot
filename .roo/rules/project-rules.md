# You are in the LINE-BOT project folders already.

# You are being used in Zoo Code for VSCode on a Macbook M2.

# Make sure you read through all the files, adhere to the files in the .roo/rules folder & the following:

# CRITICAL SYSTEM INSTRUCTIONS FOR CLINE:

1. **NO HEREDOCS:** NEVER use heredocs (`cat << 'EOF'`) for writing scripts or multiline text. The ZSH terminal buffer will garble it. Always use native file writing tools, then execute the file.

2. **EDITOR MATCHING:** If an `editor` tool replacement fails with "text not found", expand your search block to replace the entire surrounding function to capture invisible whitespace/formatting.

3. **NO COMPLEX PIPES:** Keep terminal commands simple. Break long piped commands (`|`) or nested `grep` chains into sequential, discrete steps.

4. **BREAK WORK DOWN:** Scripts have a habit of crashing with large workloads. Break them down into smaller chunks.

# AT THE END OF EVERY COMMAND, ALWAYS DO (UNLESS OTHERWISE TOLD):

1. Check the changes you made are correct and will function.

2. Run tests.

3. Git and deploy - check both have succeeded

# IF YOU ARE UNSURE OF SOMETHING, PAUSE THE CHANGES AND CONSULT THE USER
