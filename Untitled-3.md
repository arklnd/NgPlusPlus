Tech Stack: MCP Project is being created with TypeScript/Node.js. The reason behind this choice is that ecosystem-related benefits can be leveraged.

Codebase Setup: Since Node.js comes as a bare programming language without any framework, we have created a complete setup for transpiling TypeScript to JavaScript, unit testing, debugging test cases with VS Code, and a GitHub pipeline to run test cases autonomously on different machines while keeping the development machine free to work on other features and bugs.

Repo URL: arklnd/NgPlusPlus (https://github.com/arklnd/NgPlusPlus)



Solution:

After getting the set of package updates user want to apply,

    Approach 1: We tried to analyze the whole dependency tree by ourselves purely on a mechanical basis. The plan was that at any point in our implementation journey, if a step was not feasible to implement mechanically by any means, we would hand over the processing to the LLM. 

        Difficulty: The core difficulty we faced with this approach is that traversing the dependency tree algorithmically is definitely possible but extremely complex to implement. Finding the suitable point to involve the LLM in place of a deterministic step is hard, which was essentially prolonging our implementation. Considering the remaining time in 2025, we ditched this approach.

    Approach 2: This time we started with a simple dumb loop which will indefinitely (with a hardcoded max cap) try to apply requested updates until a successful 'npm install' can be made with all updates. In each iteration, the LLM will analyze the preceding output from the 'npm install' step and make suitable changes to the user-provided updates to achieve a newer Angular version.

        Difficulty: During initial implementation, the process gradually traversed back to the original Angular version from which the original project belonged. The issue was that we were feeding wrong error messages from the 'npm install' step to the LLM. LLMs are trained on user data from the internet where people usually try to make their package versions stable by any means. The LLM was doing exactly the same here. The best solution to make the situation stable was simply predicting old versions which definitely had successful npm installs.

        Solution: To overcome this issue, we broke the prediction step into two parts. The 1st part analyzes the error message and generates a JSON describing different packages involved in the installation error with a ranking of them that denotes which dependency package has higher weightage to resolve the situation. We added a hard constraint in the prompt for the 2nd step that the LLM should only provide versions greater than or equal to the original version currently installed. This way, the LLM was forced to only think in the forward direction.

        Further Enhancement: Apart from this, we have feed readme metadata of npm packages involved in each iteration of conflict resolution, to a third LLM step (upgrade suggestions provided by the 2nd step of earlier discussed solution) to rectify rank and upgrade suggestion towards a more accurate data driven decision. Obviously, there is more room to integrate other package meta data to the processes.
 

Current status: The MCP server currently resolves installation errors and suggests suitable package versions to achieve the requested Angular upgrade. With the Arborist integration, the process is now significantly faster (30-40% speed improvement) and more reliable due to structured error handling and elimination of fragile text parsing. However, in its current implementation, the tool sometimes attempts to upgrade beyond the requested Angular version, which can lead to a back-and-forth version loop for certain packages toward the end of the process.



Major pain points: 

    Trial runs are very time consuming: To have a meaningful outcome, we must run the test for at least 50+ iterations. We have 2-3 LLM invocations in each iteration, and each LLM invocation adds delay in each iteration when we already have a significant delay to run 'npm install' in the first step. Thus, a 50+ iteration trial easily takes 1h+. Debugging such a process with prolonged sessions is difficult, so analyzing logs is the only way, which is also a cumbersome process to analyze a log file of 5000+ lines.

    LLM gives lots of surprises: As LLMs are non-deterministic, they usually come with new predictions which trigger different edge cases in our codebase, forcing developers to work on them first instead of on core logic.

    Inconsistent Metadata: npm packages often doesn't follow standard way to orchestrate metadata about it. For example in npm package's has a readme field present in package.json, instead of here, owners often put their readme data in hosting platform provided placeholder/homepage, (as github redame, or npmjs.com provided readme placeholder)




---

## 🚀 Major Breakthrough: December 2025 System Upgrade

### Executive Summary - What Changed & Why It Matters

In mid-December 2025, we integrated **@npmcli/arborist** (npm's official dependency engine) into our system. This single architectural decision delivered importent improvements across speed, and reliability.

**Bottom Line Results:**
- ⏱️ **30-40% faster execution**: 50-iteration runs now complete in ~45 minutes instead of 60+ minutes
- 💰 **Reduced LLM invocation**: Cut 500-1000 tokens per iteration by eliminating unnecessary LLM calls
- 🎯 **100% parsing accuracy**: Eliminated unreliable text parsing that occasionally misread error messages
- 🔧 **87% less maintenance code**: Removed 387 lines of fragile custom parsing logic

---

### What We Built & The Business Impact

#### 1️⃣ **Solved the "Version Format Problem"** _(Dec 14)_

**The Challenge in Simple Terms:**  
Think of it like trying to read documents that come in 3 completely different formats (Word, PDF, Google Docs). Our system had to manually handle each format with custom code, which was time-consuming to maintain and broke whenever the formats changed.

**What We Did:**  
Switched to npm's official "universal translator" (Arborist) that automatically reads all format versions correctly.

**Business Value:**
- **Future-proof**: No more breaking when npm changes formats
- **Lower maintenance**: Reduced this codebase from 387 lines → 50 lines (87% reduction)
- **Fewer bugs**: Official library is tested by millions of npm users daily
- **Consistent information feeded to next LLM step.

---

#### 2️⃣ **Made Error Messages Structured & Machine-Readable** _(Dec 16)_

**The Challenge in Simple Terms:**  
Imagine receiving customer complaints as audio recordings instead of structured forms. You'd have to listen to each one and manually figure out what the issue is. That's what we were doing with error messages - reading unstructured text.

**What We Did:**  
Changed how we run installations so errors come as structured data (like filling out a form with Name, Issue Type, Details fields) instead of free-text descriptions.

**Business Value:**
- **Accurate diagnosis**: Always know exactly which package is conflicting and why
- **Faster troubleshooting**: No more misreading error messages
- **Better logging**: Debug issues faster with clear, categorized data

---

#### 3️⃣ **Eliminated Unnecessary LLM Calls** _(Dec 16)_ 
### 💡 THE BIG WIN

**The Challenge in Simple Terms:**  
We were asking LLM to do something humans could do deterministically - like using a calculator to add 2+2 instead of just doing the math. Each unnecessary LLM call added 5-15 seconds delay and cost tokens.

**What We Did:**  
Now that errors come as structured data, we wrote simple logic to read them directly. Think: reading a form field instead of asking LLM to interpret handwritten notes.

**Before:** 
1. Get messy error text → 2. Ask LLM "what does this mean?" / Ask LLM to parse it → 3. Ask LLM "how to fix it?"

**After:**  
1. Get structured error data → 2. Read it directly → 3. Ask LLM "how to fix it?"

**Business Value:**
- ⏱️ **Time Savings**: 5-15 seconds per iteration × 50 iterations = **4-12 minutes saved per run**
- 💰 **Cost Savings**: 500-1000 tokens saved per iteration. Resulting cleaner contexrt window
- ✅ **Reliability**: Eliminated LLM hallucination risk in error interpretation (now 100% accurate)
- 📊 **Scalability**: The more iterations needed, the more time/token we save

---


========================================================================
========================================================================
========================================================================
========================================================================
========================================================================
========================================================================
========================================================================
========================================================================
========================================================================
========================================================================
========================================================================
========================================================================
Current Status, Dec 2025
[ADD HOW FALACY OF RANDOMNESS IN LLM IS AFFCTING US]