# Scenario 5.1 -- Vision classification

::: tip TL;DR
Send an image to the vision model, verify it returns a description.
:::

**Goal**: verify image_classify sends an image to the vision model and returns a description.

> Requires a vision model installed (default: `llava-llama3`).
> Place any image at `data/examples/shark.jpg` first.

**Prompt:**

```
Classify the image at data/examples/shark.jpg and describe what it most likely shows.
```

**Expected tool**: `image_classify`

**What should happen:**

```
Step 1: image_classify  ->  { "path": "data/examples/shark.jpg" }
        returns: "The image shows a great white shark..."
Step 2: action: "none"  ->  forwards the description
```

**Try with a custom prompt:**

```
Look at data/examples/shark.jpg and tell me what species the animal might be.
```

(Agent passes a custom `prompt` field to the tool)

---

← [Back to Scenarios](index.md)
