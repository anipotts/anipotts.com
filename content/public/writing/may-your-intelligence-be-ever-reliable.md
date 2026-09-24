---
slug: may-your-intelligence-be-ever-reliable
title: may your intelligence be ever reliable
summary: typesafe shipped a model that returns calibrated decisions instead of text. what jev actually is, what survives testing, and why the honest version is better than the launch copy
tags: [ai, jev, typesafe, calibration, agents, claude-code]
status: draft
content_type: article
---

I opened the TypeSafe console for the first time at 8:31 on a Monday night, on my phone, and the onboarding letter ended like this:

> May your intelligence be ever reliable,
>
> Diogo, Erik, and Sasha

I stopped on that line longer than a sign-off deserves.

It splits two things the industry has spent three years welding together. Intelligence is whether the model gets it right. Reliability is whether you can tell, ahead of time and from the model itself, how much to trust this particular answer. We have been buying the first and assuming the second rides along.

It does not. And the thing that broke it is the thing that made these models useful.

<!-- TK: the personal opening. what i was actually trying to ship that night, and the specific decision in my own harness that Jev would have made for a tenth of a cent. -->

## what jev actually is

Jev is a transformer that is not a language model. It does not generate text. You hand it a `state` and a dict of typed questions, and in one forward pass you get back a probability distribution per question.

```
state (text or JSON) + typed questions -> constrained answers + probabilities -> your code branches
```

Everything else about it follows from that shape.

Three primitives, and they are the whole API:

- `Choice` picks one of up to 255 options you supplied. Returns the choice, a probability for every option, and a confidence.
- `Score` places the state on a 2 to 10 level ordered rubric you wrote. Returns a probability-weighted score that can land between levels.
- `Noul` returns the probability a statement is true, 0 to 1. No confidence field, because the probability is the confidence.

```python
questions = {
    "intent": Choice(
        instructions="What is the customer's main request?",
        criteria={"refund": "...", "technical_help": "...", "other": "..."},
    ),
    "is_urgent": Noul(
        instructions="Does the ticket explicitly communicate time pressure?",
    ),
    "frustration": Score(
        instructions="How frustrated does the customer appear?",
        criteria=["Calm", "Concerned but civil", "Very angry"],
    ),
}
```

Notice what is missing. No system prompt. No response format. No JSON schema you hope it respects. The answer space is the argument.

TypeSafe calls this a System One model, borrowing Kahneman's split between fast automatic judgment and slow deliberate reasoning. The borrow is honest. This is the layer that answers "is that the door handle" without deliberating, and taps the expensive system on the shoulder when it genuinely cannot tell.

## the architecture, derived rather than guessed

TypeSafe published no paper and no weights. Asked about the architecture on Hacker News, Diogo Almeida said he was keeping it close to the chest.

So someone rebuilt it. [jev-from-scratch](https://github.com/Maverick-Ansh/jev-from-scratch) is a first-principles reconstruction that trains on a free Colab T4 in under ten minutes. Its argument is that you do not need the weights, because four published sentences fully determine the shape.

| what typesafe published | what it forces |
| --- | --- |
| "generates all outputs in a single query rather than autoregressively" | no causal mask, no KV-cache loop |
| "questions evaluate independently against shared state" | the joint is a product of per-question marginals |
| "Choice up to 255 options, Score 2 to 10 levels, Noul a probability" | the output head has no token vocabulary |
| "output tokens free" and "0% structured output error" | the response is a handful of floats |

All three primitives turn out to be the same operation. Your option text gets encoded into vectors. Your instruction text gets encoded into a query vector that cross-attends over every position of the state. Then the answer is a softmax of the dot products between that query and the option vectors, scaled by the square root of the dimension.

Choice is that for up to 255 options, which is exactly one byte of option index. Noul is that for two. Score is that over ordered level descriptions plus a readout of the expected level, which is why the docs say a score may fall between levels.

Two consequences are worth carrying around.

**Type safety is a theorem, not a metric.** There is no token vocabulary anywhere in the output path, so an invalid answer is not representable. That is a different kind of claim from the one a frontier model makes with constrained decoding. The reconstruction measured an autoregressive baseline putting 4 in 10,000 of its probability mass on strings that are not valid options. At a million calls a day that is hundreds of malformed responses. Jev's is identically zero, because those outcomes are not in the sample space. Every "0%" number in the launch material is of this kind. A better generative model cannot beat it and cannot match it either, only approach it in expectation.

**Confidence is normalized entropy.** It is one minus the entropy of the distribution over the log of the option count. For a two-option question that is a deterministic function of the probability alone. Which is exactly why the public API gives Choice and Score a separate confidence field and says Noul's confidence is built into the probability itself. The reconstruction predicted an asymmetry in TypeSafe's API that nobody put in by hand. That is the strongest evidence I have seen that the rebuild is right.

## the rlhf co-inventor built the anti-rlhf company

Diogo Almeida worked on the instruction-following research behind ChatGPT at OpenAI. He helped make RLHF work. TypeSafe's entire thesis is that RLHF destroys the one property production software needs.

The pitch: RLHF trains a model to produce answers a human rater approves of. RLCD, Reinforcement Learning for Calibrated Decisions, trains a model to produce a decision paired with a probability that matches how often that decision is actually right. RLHF optimizes for sounding right. RLCD optimizes for being right with a number attached that software can act on.

Here is where it gets good, because the reconstruction tested it and the honest answer is not the marketing answer.

A proper scoring rule is one that is maximized, in expectation, by reporting the true posterior. The log score is strictly proper. So cross-entropy training is already a calibration objective. Measured: plain cross-entropy lands 0.003 from perfect calibration. Brier adds nothing. There is nothing here for RLCD to beat.

Now look at what an accuracy reward optimizes. Expected reward is a sum of probability times an indicator, which is linear in the probability vector, so it is maximized at a vertex of the simplex. **The optimum of an accuracy reward is a point mass.** Any model trained to convergence on it must report probability 1 on its best guess regardless of what it actually knows.

| objective | proper? | accuracy | mean confidence | ECE |
| --- | --- | --- | --- | --- |
| cross-entropy | yes | 0.723 | 0.725 | 0.0145 |
| accuracy-reward RL | no | 0.462 | 1.000 | 0.538 |
| CE then RL, the RLHF pipeline | no | 0.720 | 0.918 | 0.199 |

One epoch of accuracy-reward RL on a perfectly calibrated model moved mean confidence from 0.725 to 0.918 while accuracy sat flat at 0.720. That is the overconfidence of every chat model you have ever used, reproduced from scratch on a free GPU, with the mechanism named.

So the honest reading of RLCD is not "the thing that makes Jev calibrated." It is: if you want to do RL at all, your reward has to be a proper scoring rule, or you will destroy the exact property you are selling. That is a smaller claim than the launch copy makes and a far more interesting one. It is also why a decision-model company had to invent a third RL variant instead of reaching for the one its founder helped build.

And what is calibration worth? Confidence-gated routing, where software auto-handles what the model is sure about and escalates the rest:

| model | accuracy | volume safely automated at a 95% bar |
| --- | --- | --- |
| calibrated | 0.723 | 37.4% |
| RL-tuned | 0.720 | 30.1% |
| collapsed | 0.462 | 0% |

Two models 0.3 accuracy points apart. The calibrated one safely automates a fifth more volume. The collapsed one can gate nothing at all, because with confidence pinned at 1.000 there is no ordering left to threshold.

The confidence field is the product.

## what survives testing

The reconstruction turned seven architectural claims into measurements and let them fail. Three did.

| claim | verdict |
| --- | --- |
| the independence factorisation is cheap | holds, conditionally |
| deleting the causal mask is what makes it work | refuted, it is noise |
| one pass for K questions means latency flat in K | holds, 60x at K=50 |
| 0% structured output error is an advantage | refuted as an advantage, upheld as a guarantee |
| RLCD is what makes Jev calibrated | refuted, cross-entropy already is |
| the speed is architecture, not a small model | holds at batch 1, weakens under batching |
| the factorisation's cost is invisible in practice | refuted, 3.5% self-contradictory tuples |

That last one is the trap, and nobody warns you about it.

Because questions are evaluated independently, Jev can return `severity = low` and `page_oncall = yes` in the same response. Each answer individually well calibrated. The tuple nonsense. Measured at 3.5% of responses.

The part that took me a minute: turning on attention between the questions does not fix it. 3.18% versus 3.48%. It cannot fix it, because the queries are still a deterministic function of the state, so the output is still a product of marginals. Shared computation is not shared randomness. The only real fixes are autoregression, a latent variable, or a second Jev call whose state contains the first call's answers.

Which quietly reframes TypeSafe's "ask narrow atomic questions and compose in code" from style advice into the condition under which their architecture is lossless. Asking severity and page_oncall together burns 0.221 nats re-deriving `sev >= 3`, which an `if` statement does for free and exactly.

## the calibration curve nobody published

TypeSafe named the training method after calibration and shipped no calibration curve. As far as I can tell nobody else had either, until someone ran 4,995 real coding-agent decisions through it and [published one](https://github.com/WanLanglin/jev-skills).

Noul probabilities, 5.3% base rate:

| jev says | n | actually true |
| --- | --- | --- |
| 0.0 to 0.1 | 843 | 0.7% |
| 0.2 to 0.3 | 1359 | 4.9% |
| 0.4 to 0.5 | 271 | 11.4% |
| 0.8 to 0.9 | 10 | 70.0% |
| 0.9 to 1.0 | 29 | 96.6% |

ECE is 0.169. Read the middle row again. Jev says 0.45, reality is 11%. Do not put a raw Jev probability into an expected-value calculation without recalibrating on your own task.

But the ordering is almost perfectly monotone and both tails are excellent. Below 0.1 the true rate is under 1%. Above 0.9 it is 96.6%. Operate in the tails. Never in the middle.

Choice confidence is worse. ECE 0.226, and between 0.4 and 0.9 the empirical accuracy wanders between 26% and 50% with no useful slope. Five bins covering 284 decisions that are, for practical purposes, indistinguishable from each other. Only the top bin separates, and even there a claim above 0.9 is right 81% of the time. That pack shipped a 0.7 default threshold, measured that one in three "confident" answers at 0.7 was wrong, and moved the default to 0.9.

<!-- TK: my own calibration curve. 100+ items from my own labeled set, binned, ECE computed. this is the part that makes the post mine instead of a summary of someone else's measurement. -->

### the economic fact everyone is missing

```
input_tokens ~= state_tokens (once) + N x 19
```

| questions | input tokens | latency |
| --- | --- | --- |
| 1 | 622 | 0.38s |
| 16 | 868 | 0.38s |
| 256 | 11,608 | 0.72s |

The shared state is billed once no matter how many questions ride on it. 256 calibrated judgements for $0.0005 in 0.72 seconds. The same work on Opus 5 runs about $0.18.

That is the 360x, and it has almost nothing to do with the per-token price. It is amortizing the state. Most of the Jev ecosystem treats it as a single-decision oracle and leaves the entire advantage on the table.

<!-- TK: run the batching test in the console myself and paste my own numbers. 1 question vs 64 vs 256 on the same state. -->

## your agent has no system 1

This is the part I actually care about.

You do not reason your way through "is this the door handle." A fast automatic system answers, and only the genuinely hard calls get escalated. The fast one handles almost everything, and it knows when to tap the slow one on the shoulder.

A coding agent has none of that. Every judgement goes through the most expensive reasoning model available. Is this file relevant. Is this finding real. Is this test flaky. Is this hunk risky. A `grep` returns 300 hits and Opus reads them, or spawns a subagent that costs forty seconds and hundreds of thousands of tokens, to answer three hundred questions that each deserve about a millisecond of thought.

I have been building harnesses around this problem for a year without naming it. The naming is the useful part.

The measured version: on that same agent-transcript task, Jev finds 1.6x more of the files the agent actually needed, in the same number of opens, for $0.011 across the entire run.

It is a prioritiser, not a filter. It still misses 31% of needed files after you read its top 10. That matters, and the pack that measured it says so plainly, which is more than the vendor does.

<!-- TK: install it into my own Claude Code and Codex setup, run it for a week against real sessions, report what actually changed. that is the post people will share. -->

## where this sits

The skeptic case is strong and I want to carry it fairly.

Within hours of launch, the Hacker News thread mapped Jev onto known techniques: BERT and DeBERTa zero-shot classifiers, GLiNER span models, cross-encoder rerankers, constrained decoding with logit-derived confidence, conformal prediction, DSPy typed signatures. When a commenter said "this is basically a zero-shot classifier," Almeida replied "exactly right!"

There is no paper, no open weights, and the model is not on OpenRouter. The 193.6x faster and 444.6x cheaper numbers are self-tested. On TypeSafe's own evaluation Jev ties Sonnet 5 and trails Opus 5 on accuracy, at roughly 200x less cost per case.

All true. And mostly beside the point.

"It's a zero-shot classifier" is a description, not a rebuttal. What is new is not the classifier. It is that the option text arrives at request time, so there is no training run per taxonomy. It is that the shared state amortizes across arbitrarily many questions. And it is that someone finally priced and shipped this as a category instead of a thing you fine-tune yourself. Nobody had to invent new math for the assembly line either.

Three days after launch, [Laya](https://huggingface.co/convaiinnovations/laya) landed: 421M parameters, ModernBERT trunk plus a decision head trained from scratch, Apache 2.0, 33ms on a T4. The open-weights answer arrived inside a week, which tells you the moat is not the architecture. Worth noting that Laya re-encodes the content per question and scales linearly, so it does not have the batching property. That property is the actual product.

## what i think

Reliability is an axis, not a tier.

Jev is not smarter than Opus. It ties Sonnet and trails Opus on accuracy, and it cannot explain itself, count reliably, handle double negatives, or read past the literal words of your question. What it sells is a number you can threshold, and the measured result is that two models 0.3 accuracy points apart differ by seven points of safely automatable volume.

That is a real product category and I think it survives, whether or not TypeSafe is the one who wins it.

What would change my mind: an independent head-to-head against a fine-tuned DeBERTa on identical tasks, which nobody has published. A calibration curve from TypeSafe itself. And any evidence that the middle of the probability range is usable, because right now it is not, and the tails are doing all the work.

What would not change my mind: another round of vendor benchmarks.

<!-- TK: closing line. something that earns the title back. -->

## the gotchas, collected

For anyone building on this today, the things that cost me time or would have:

- Probabilities come back quantised to 2 decimals. Thresholds finer than 0.01 are meaningless.
- A request is bounded by total input tokens, around 32,800 before hard rejection, not by question count. 512 questions on a short state is fine.
- `jev-1.13` does not count reliably and degrades on numeric precision, double negatives, and multi-hop indirection.
- It answers the question you wrote, not the one you meant. Scoping words, negations, and implied conditions are read at face value.
- It knows nothing beyond the state you hand it, and accuracy falls as the state fills with material the question does not need.
- Pin a versioned model id if your thresholds depend on model behavior. Aliases move, and calibration moves with them.

## facts

| | |
| --- | --- |
| shipped | September 15, 2026 |
| funding | $40M seed, led by DCVC |
| founders | Diogo Almeida, Erik Gafni, Sasha Sheng |
| endpoint | `POST https://api.typesafe.ai/v1/systemone` |
| model | `jev-latest`, currently `jev-1.13.0` |
| price | $0.042 per 1M input tokens, output free |
| context | 64k total, 32k for state plus longest question |
| rate limit | 1,200 requests per minute |
| latency | 70 to 500ms claimed, 0.38 to 0.72s measured |
| modality | text only, English primary |

## sources

- [Introducing System One Models and Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev), TypeSafe
- [jev-from-scratch](https://github.com/Maverick-Ansh/jev-from-scratch), the first-principles reconstruction
- [jev-skills](https://github.com/WanLanglin/jev-skills), the measured calibration curve
- [awesome-jev-by-typesafe](https://github.com/Anil-matcha/awesome-jev-by-typesafe), use cases and patterns
- [Model jaggedness for jev-1.13](https://docs.typesafe.ai/model-jaggedness/jev-1.13), TypeSafe's own list of weaknesses
- [What everyone is getting wrong about Jev](https://www.kdnuggets.com/what-everyone-is-getting-wrong-about-typesafe-ais-jev), KDnuggets
- [Laya open weights](https://huggingface.co/convaiinnovations/laya), Convai Innovations
- Gu et al., [Non-Autoregressive Neural Machine Translation](https://arxiv.org/abs/1711.02281), 2018
- Gneiting and Raftery, Strictly Proper Scoring Rules, Prediction, and Estimation, JASA 2007
