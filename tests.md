Okay, here are detailed manual tests you can perform within Obsidian to verify the changes. Make sure you have the latest version of your plugin installed in your Obsidian vault.

**Prerequisites:**

1.  Obsidian is open.
2.  Your Novelist plugin is installed and enabled.
3.  You have a Novelist project set up, with at least one scene/note.
4.  Familiarity with opening notes in the default Obsidian editor, and using Novelist's Inspector, Scrivenings, and Snapshot Manager views.

---

### **Test Case 1: Safe Frontmatter Updates (via Inspector/Binder)**

**Objective:** Verify that updating metadata fields (like Status, Rank, Synopsis) through Novelist's UI (e.g., Inspector, Binder) correctly updates *only* the specified frontmatter field without touching or deleting the note's body content or other frontmatter fields. This directly tests the `updateMetadata` function.

**Steps:**

1.  **Create a New Note:**
    *   Create a new Markdown note (e.g., `Test Note 1.md`).
    *   Add some specific frontmatter to it:
        ```yaml
        ---
        status: Draft
        rank: 1
        label: Scene
        synopsis: This is the initial synopsis.
        my_custom_field: important_data
        ---
        ```
    *   Add a substantial amount of body content below the frontmatter:
        ```markdown
        This is the body content of Test Note 1.
        It has multiple paragraphs and should not be deleted or altered.

        Paragraph 2.

        - List item 1
        - List item 2

        This is some important text that must be preserved.
        ```
    *   Save and close the note.
2.  **Open in Novelist Inspector:**
    *   Open `Test Note 1.md` in a Novelist Inspector view.
3.  **Update Metadata:**
    *   Change the **Status** from `Draft` to `Revision`.
    *   Change the **Rank** from `1` to `5`.
    *   Update the **Synopsis** to `This is the revised synopsis.`
4.  **Verify in Obsidian Editor:**
    *   Open `Test Note 1.md` in the standard Obsidian editor.
    *   **Expected Outcome:**
        *   The frontmatter `status` should now be `Revision`.
        *   The frontmatter `rank` should now be `5`.
        *   The frontmatter `synopsis` should now be `This is the revised synopsis.`.
        *   The `label` field should still be `Scene`.
        *   The `my_custom_field` should still be `important_data`.
        *   The **entire body content** you wrote in Step 1.1 must be completely intact and unchanged.

---

### **Test Case 2: Scrivenings Saves Preserving Live Frontmatter**

**Objective:** Verify that when you edit and save a note within the Scrivenings view, it only updates the note's body content, preserving any frontmatter changes that might have occurred externally (e.g., in an Inspector view) *while Scrivenings was open*. This directly tests the `updateNoteBody` function's role in Scrivenings.

**Steps:**

1.  **Prepare a Note:**
    *   Create a new Markdown note (e.g., `Test Scrivenings.md`).
    *   Add frontmatter:
        ```yaml
        ---
        status: Initial Draft
        rank: 10
        ---
        ```
    *   Add body content:
        ```markdown
        This is the original body content for Scrivenings.
        It has a few lines.
        ```
    *   Save the note.
2.  **Open in Scrivenings:**
    *   Open `Test Scrivenings.md` in a Novelist Scrivenings view.
3.  **Simulate External Frontmatter Change:**
    *   Without closing the Scrivenings view, open `Test Scrivenings.md` in a separate **Novelist Inspector view** (or the standard Obsidian editor).
    *   In the Inspector, change the **Status** to `Final Draft` and the **Rank** to `1`.
    *   Save this change (usually automatic in Inspector, or manually save in default editor).
    *   **Important:** The Scrivenings view is still open, but its internal model of the frontmatter is now *stale*.
4.  **Edit and Save in Scrivenings:**
    *   Go back to the Scrivenings view.
    *   Add a new line of text to the body: `This line was added in Scrivenings.`
    *   Manually trigger a save in Scrivenings (if there's a save button, or by simply exiting the editor if it auto-saves).
5.  **Verify Final State:**
    *   Close the Scrivenings view.
    *   Open `Test Scrivenings.md` in the standard Obsidian editor.
    *   **Expected Outcome:**
        *   The frontmatter `status` should be `Final Draft`.
        *   The frontmatter `rank` should be `1`.
        *   The body content should include:
            ```markdown
            This is the original body content for Scrivenings.
            It has a few lines.
            This line was added in Scrivenings.
            ```
        *   The frontmatter **must NOT** have reverted to `Initial Draft` and `10`.

---

### **Test Case 3: Snapshot Restoration Preserving Live Frontmatter**

**Objective:** Verify that restoring a snapshot only replaces the note's body content and **does not overwrite or delete** the note's current frontmatter. This directly tests the `updateNoteBody` function's role in Snapshot Manager.

**Steps:**

1.  **Prepare a Note for Snapshot:**
    *   Create a new Markdown note (e.g., `Test Snapshot.md`).
    *   Add frontmatter:
        ```yaml
                ---
        status: Initial Snapshot State
        rank: 1
        original_synopsis: This is the synopsis at snapshot time.
        ---
        ```
    *   Add body content:
        ```markdown
        This is the body content for the initial snapshot.
        First paragraph.
        ```
    *   Save the note.
2.  **Create Initial Snapshot:**
    *   Open the Novelist Snapshot Manager.
    *   Select `Test Snapshot.md` and create a new snapshot (e.g., name it "Initial State").
3.  **Modify Note's Frontmatter and Body (After Snapshot):**
    *   Go back to `Test Snapshot.md` in the standard Obsidian editor.
    *   Change the frontmatter:
        ```yaml
        ---
        status: Modified State
        rank: 5
        updated_synopsis: This synopsis was changed AFTER the snapshot.
        ---
        ```
    *   Significantly change the body content:
        ```markdown
        This is the NEW body content, completely different from the snapshot.
        New second paragraph.
        More new text.
        ```
    *   Save the note.
4.  **Restore Snapshot:**
    *   Open the Novelist Snapshot Manager.
    *   Select `Test Snapshot.md` and choose the "Initial State" snapshot you created.
    *   Click the "Restore" button (or equivalent action). Confirm any prompts.
5.  **Verify Final State:**
    *   Open `Test Snapshot.md` in the standard Obsidian editor.
    *   **Expected Outcome:**
        *   The frontmatter should reflect the **Modified State** changes:
            ```yaml
            ---
            status: Modified State
            rank: 5
            updated_synopsis: This synopsis was changed AFTER the snapshot.
            ---
            ```
        *   The body content should revert to the **Initial Snapshot State** content:
            ```markdown
            This is the body content for the initial snapshot.
            First paragraph.
            ```
        *   The frontmatter **must NOT** have reverted to `Initial Snapshot State`, `rank: 1`, or `original_synopsis`. Only the body should have changed.

---

These tests cover the core functionality of the new metadata and body update utilities and ensure the critical data integrity aspects are working as intended.