/**
 * Relationship Index Trait Extraction — Test Harness
 *
 * Run this from the command line to test the trait extraction prompt
 * against arbitrary LinkedIn data without needing the full Chrome extension.
 *
 * Usage:
 *   1. Save this as `test-relationship-index.ts` in your project root
 *   2. Set ANTHROPIC_API_KEY in your env (`.env.local` or shell)
 *   3. Edit the `testProfile` object below with real or sample data
 *   4. Run: `npx tsx test-relationship-index.ts`
 *
 * What you should see:
 *   - First request: ~3-5 second response, $0.03-0.06 cost
 *   - Second request (within 5 min): ~1-2 sec faster, ~90% cost savings on system prompt
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
if (!ANTHROPIC_API_KEY) {
  console.error("Set ANTHROPIC_API_KEY env var first.");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT — paste from 01-system-prompt.md (the content inside the ``` block)
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the Humble Hello Relationship Index analyzer. You analyze LinkedIn profile data to produce a behavioral profile based on the Five Factor Model of personality, mapped to Humble Hello's proprietary 5 dimensions and 8 archetypes.

## Your job

Given LinkedIn profile data extracted from a single user-initiated profile view, produce a structured analysis containing:
1. Five Factor Model trait scores (0-100) with evidence
2. Humble Hello's 5 dimensions (0-100) with evidence
3. The single best-fit archetype (one of 8) with reasoning
4. A communication brief (3-5 actionable tips for someone messaging this person)
5. A confidence and data-richness assessment

## The framework

### Five Factor Model (your scientific foundation)
- **Openness**: Curiosity, range of interests, comfort with ambiguity vs. preference for the familiar
- **Conscientiousness**: Self-discipline, planning, achievement-orientation vs. spontaneity
- **Extraversion**: Sociability, assertiveness, energy in groups vs. preference for solitude
- **Agreeableness**: Warmth, cooperation, trust vs. competitiveness and skepticism
- **Neuroticism**: Emotional reactivity, vulnerability vs. emotional stability (NOTE: in the output, present this as "Stability" with the score INVERTED — high stability score = low neuroticism)

### Humble Hello's 5 dimensions (what users see)
- **Drive**: How much they push toward outcomes. High = ambitious, results-focused, decisive. Low = collaborative, deliberate, relationship-first.
- **Depth**: How much they go beneath surface. High = analytical, contemplative, expert-oriented. Low = practical, action-oriented, present-focused.
- **Pace**: How quickly they move and decide. High = fast, energetic, talks/moves quickly. Low = measured, patient, thoughtful timing.
- **Structure**: How much they need order. High = process-driven, planner, organized, formal. Low = flexible, improvisational, comfortable with ambiguity.
- **Warmth**: How relationship-oriented they are. High = empathetic, supportive, encouraging. Low = direct, transactional, focused on substance over feelings.

### The 8 archetypes

Each archetype represents a coherent pattern across the 5 dimensions. Pick the SINGLE archetype that best fits the overall pattern.

1. **Driver**: High Drive + high Pace + lower Warmth. The decisive achiever. Moves fast, focuses on results, can be impatient with process or feelings. Best at execution and forcing decisions. Watchout: can steamroll. Common in: founders, sales leaders, COOs.
2. **Analyst**: High Depth + high Structure + lower Pace. The careful thinker. Wants data, frameworks, time to consider. Strong at quality and avoiding errors. Watchout: paralysis when facts are unclear. Common in: engineers, researchers, financial roles.
3. **Visionary**: High Drive + high Depth + low Structure. The big-picture builder. Loves novelty, long horizons, ambiguous problems. Strong at innovation and storytelling. Watchout: skips details, abandons before completion. Common in: founders, product leaders, designers.
4. **Connector**: High Pace + high Warmth + medium Drive. The relationship builder. Energized by people, makes introductions, networks naturally. Strong at bringing groups together. Watchout: can over-promise, conflict-averse. Common in: BD, recruiting, community roles.
5. **Helper**: High Warmth + high Depth + lower Drive. The thoughtful supporter. Listens well, anticipates needs, prioritizes others. Strong at coaching and care work. Watchout: avoids hard conversations, neglects own goals. Common in: HR, customer success, healthcare.
6. **Planner**: High Structure + high Conscientiousness + medium Pace. The reliable organizer. Lists, processes, calendars. Strong at delivering on commitments and reducing chaos. Watchout: rigid when plans must change. Common in: PM, ops, accounting.
7. **Challenger**: High Drive + high Depth + low Warmth. The skeptic-improver. Asks hard questions, probes weak arguments, raises uncomfortable points. Strong at preventing bad decisions. Watchout: comes across as combative or negative. Common in: lawyers, auditors, contrarian executives.
8. **Observer**: Lower Pace + lower Drive + high Depth. The quiet expert. Watches, learns, shares knowledge selectively. Strong at perspective and avoiding hasty action. Watchout: can be hard to read, slow to act. Common in: senior individual contributors, consultants, advisors.

## Critical rules

1. **Cite evidence for every score.** Each trait, dimension, and the archetype must reference specific text from the input (a phrase from their bio, a job title pattern, post content). Never claim a score without quoting or summarizing the supporting evidence.
2. **Score on behavior, not communication style.** Corporate-speak, second-language phrasing, or careful executive PR shouldn't bias scores. Look for what they DO (job changes, achievements, choices) over how they SAY it.
3. **Sparse data is okay — say so.** If you only have title + company, score what you can and report data_richness as "low". Use confidence scores to express uncertainty. Never refuse to produce output. Never hallucinate evidence; if a dimension can't be supported, mark its confidence as low and note the lack of signal.
4. **Output ONLY the XML structure below, nothing before or after.** No preamble, no closing remarks, no markdown. Pure XML.
5. **Stability vs. Neuroticism.** In the Five Factor block, score "stability" (the inverse of neuroticism). High score = emotionally steady. We never show "neuroticism" in user-facing output.
6. **The archetype is a single best fit.** Do not list multiple. Pick one. If two are close, pick the one that better explains the most distinctive evidence.

## Output format

Always respond with EXACTLY this structure, with no text before or after:

<analysis>
  <data_richness>high|medium|low</data_richness>
  <overall_confidence>0-100</overall_confidence>
  <five_factor>
    <openness score="0-100" confidence="0-100"><evidence>...</evidence></openness>
    <conscientiousness score="0-100" confidence="0-100"><evidence>...</evidence></conscientiousness>
    <extraversion score="0-100" confidence="0-100"><evidence>...</evidence></extraversion>
    <agreeableness score="0-100" confidence="0-100"><evidence>...</evidence></agreeableness>
    <stability score="0-100" confidence="0-100"><evidence>...</evidence></stability>
  </five_factor>
  <dimensions>
    <drive score="0-100" confidence="0-100"><evidence>...</evidence></drive>
    <depth score="0-100" confidence="0-100"><evidence>...</evidence></depth>
    <pace score="0-100" confidence="0-100"><evidence>...</evidence></pace>
    <structure score="0-100" confidence="0-100"><evidence>...</evidence></structure>
    <warmth score="0-100" confidence="0-100"><evidence>...</evidence></warmth>
  </dimensions>
  <archetype name="Driver|Analyst|Visionary|Connector|Helper|Planner|Challenger|Observer" confidence="0-100">
    <reasoning>2-3 sentences explaining why this archetype fits better than the next-closest.</reasoning>
    <runner_up>...</runner_up>
  </archetype>
  <communication_brief>
    <opening_approach>...</opening_approach>
    <tip>...</tip>
    <tip>...</tip>
    <tip>...</tip>
    <avoid>...</avoid>
    <best_channel>email|linkedin_message|phone|in_person</best_channel>
  </communication_brief>
  <life_event_signals>
    <signal type="new_job|promotion|company_change|move|other" confidence="0-100" detected_at_relative="..."><evidence>...</evidence></signal>
  </life_event_signals>
</analysis>`;

// ─────────────────────────────────────────────────────────────────────────────
// EDIT THIS — paste a real LinkedIn profile here for testing
// ─────────────────────────────────────────────────────────────────────────────

const testProfile = `Analyze this LinkedIn profile and return the Relationship Index XML.

<profile>
  <n>"Gabe Peters"</n>
  <headline>"People First Leader | Investor | finding problems & fixing them with (technology, processes and) merch"</headline>
  <location>"Fishers, Indiana, United States"/location>

  <current_role>
    <title>"President"</title>
    <company>"Thumbprint"</company>
    <start_date>"October 2013"</start_date>
    <description>"Driving the business to maximize efficiencies and create the backbone of the 7 star customer experience. Serving our Order Management, Creative and Marketing, Technology, Peaople Team, Fulfillment and Production teams."</description>
  </current_role>

  <about>"Serving a team of brilliant minds working to change the promotional product industry."</about>

  <work_history>
    <role>
      <title>PREVIOUS TITLE</title>
      <company>PREVIOUS COMPANY</company>
      <duration>e.g. 2020-2023</duration>
      <description>OR LEAVE EMPTY</description>
    </role>
    <role>
      <title>OLDER TITLE</title>
      <company>OLDER COMPANY</company>
      <duration>e.g. 2017-2020</duration>
      <description>OR LEAVE EMPTY</description>
    </role>
  </work_history>

  <education>
    <school>
      <n>SCHOOL NAME</n>
      <degree>BS, MBA, etc.</degree>
      <field>e.g. Computer Science</field>
      <years>e.g. 2010-2014</years>
    </school>
  </education>

  <skills>COMMA SEPARATED SKILLS</skills>

  <recent_activity>
    <post>
      <type>post</type>
      <date_relative>e.g. 2 weeks ago</date_relative>
      <content>PASTE A RECENT POST OR DELETE THIS WHOLE POST BLOCK</content>
    </post>
  </recent_activity>
</profile>

<context>
  <user_archetype>unknown</user_archetype>
  <last_analyzed_at>never</last_analyzed_at>
</context>`;


// ─────────────────────────────────────────────────────────────────────────────
// API call
// ─────────────────────────────────────────────────────────────────────────────

async function analyze(profileMessage: string) {
  const startTime = Date.now();

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      temperature: 0.3,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: profileMessage }],
    }),
  });

  const data = await response.json();
  const elapsed = Date.now() - startTime;

  if (data.error) {
    console.error("API error:", data.error);
    return;
  }

  console.log("\n=== ANALYSIS ===\n");
  console.log(data.content?.[0]?.text || "(no content)");

  console.log("\n=== METADATA ===");
  console.log(`Time: ${elapsed}ms`);
  console.log(`Input tokens: ${data.usage?.input_tokens || 0}`);
  console.log(`Cached input tokens: ${data.usage?.cache_read_input_tokens || 0}`);
  console.log(`Cache creation tokens: ${data.usage?.cache_creation_input_tokens || 0}`);
  console.log(`Output tokens: ${data.usage?.output_tokens || 0}`);

  // Cost estimate (Sonnet 4 pricing as of 2024-2025)
  const inputCost = ((data.usage?.input_tokens || 0) - (data.usage?.cache_read_input_tokens || 0)) * 0.000003;
  const cachedCost = (data.usage?.cache_read_input_tokens || 0) * 0.0000003;
  const cacheCreationCost = (data.usage?.cache_creation_input_tokens || 0) * 0.00000375;
  const outputCost = (data.usage?.output_tokens || 0) * 0.000015;
  const total = inputCost + cachedCost + cacheCreationCost + outputCost;
  console.log(`Estimated cost: $${total.toFixed(5)}`);
}

// Run twice to see caching benefit
(async () => {
  console.log("=== FIRST REQUEST (cache MISS) ===");
  await analyze(testProfile);

  console.log("\n\n=== SECOND REQUEST (cache HIT — ~90% cheaper system prompt) ===");
  await analyze(testProfile);
})();