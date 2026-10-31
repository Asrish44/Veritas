/**
 * Comprehensive Sample Research Paper Layouts across all major academic and industrial sectors.
 * Formatted for clean presentation with section breakdowns, sample titles, and reviewer checklists.
 */

export function isSamplePaperQuery(query: string): boolean {
  const q = query.trim().toLowerCase();
  return (
    /\b(sample research paper|research paper layout|sample paper layout|research paper template|sample research layout|paper layout|paper template|sample paper|sample research papers|sample layout|layouts? for every sector|sample paper for every sector|sample papers for all sectors|research format for every sector|format of research paper|structure of research paper|layout for research paper|template for research paper|research paper format|sample format of research paper)\b/i.test(q) ||
    (/\b(research paper|academic paper|scientific paper)\b/i.test(q) && /\b(layout|template|format|structure|sample|example|outline|skeleton)\b/i.test(q))
  );
}

export function getSamplePaperLayout(query: string): string {
  const q = query.toLowerCase();

  // Check if a specific sector was requested
  const isCS = /\b(computer science|cs|ai|artificial intelligence|machine learning|software|deep learning|data science|nlp|algorithm|cybersecurity)\b/i.test(q);
  const isMed = /\b(medicine|medical|healthcare|clinical|health|pharma|oncology|biomedical|nursing|doctor)\b/i.test(q);
  const isEng = /\b(engineering|mechanical|electrical|civil|robotics|aerospace|materials science|physical sciences?|physics)\b/i.test(q);
  const isBiz = /\b(business|finance|economics|management|marketing|corporate|accounting|fintech|banking)\b/i.test(q);
  const isSoc = /\b(social science|psychology|sociology|education|pedagogy|behavioral|humanities|political science)\b/i.test(q);
  const isBio = /\b(life sciences?|biotechnology|biology|genetics|environmental science|ecology|microbiology|marine)\b/i.test(q);

  if (isCS && !q.includes("every") && !q.includes("all")) {
    return `# 💻 Sample Research Paper Layout: Computer Science & AI (IEEE / ACM)

### Standard: IEEE Transactions / ACM Conference Format (2-Column Standard)
**Target Venues**: IEEE TPAMI, NeurIPS, ICML, ACM SIGCOMM, CVPR, ACL.

---

### Complete Section-by-Section Blueprint:

#### 1. Title & Metadata
- **Title**: *[Descriptive, Metric-Focused Title]*
  *Example*: *"FlashSkip: Dynamic Token Pruning with Attention Variance for Low-Latency Transformer Inference"*
- **Authors & Affiliations**: Author Name¹, Author Name² (¹Dept of Computer Science, University X; ²AI Research Labs).
- **Abstract** (150–250 words):
  - *Context*: Deployment bottleneck in large transformer architectures.
  - *Problem*: Redundant self-attention computation in intermediate layers.
  - *Proposed Solution*: Novel lightweight heuristic mechanism (*FlashSkip*).
  - *Quantitative Result*: 2.4× throughput speedup with <0.3% degradation on GLUE and ImageNet.
- **Index Terms / Keywords**: Deep Learning, Transformer Pruning, Inference Latency, Model Compression, Efficient AI.

#### 2. Introduction
- **1.1 Motivation**: Escalating computational cost of foundation models on edge devices.
- **1.2 Research Gap**: Static pruning ignores token significance variance across input sequences.
- **1.3 Key Contributions** (Bulleted, exact contributions):
  - Formalization of the Token Attention Variance metric.
  - Design and open-source implementation of the FlashSkip CUDA kernel.
  - Comprehensive empirical benchmarks across BERT, LLaMA, and ViT architectures.

#### 3. Related Work
- **2.1 Structured and Unstructured Weight Pruning** (e.g., Magnitude Pruning, Lottery Ticket).
- **2.2 Dynamic Inference and Early-Exit Architectures**.
- **2.3 Theoretical Positioning**: Contrast with existing baselines.

#### 4. System Architecture & Methodology
- **3.1 Problem Formulation**: Mathematical definition of input tensor $X \in \mathbb{R}^{B \times L \times D}$ and attention entropy.
- **3.2 Architectural Flowchart**: High-level pipeline diagram (Input $\rightarrow$ Gating Module $\rightarrow$ Pruned Attention $\rightarrow$ Output).
- **3.3 Algorithmic Specification**: Formal pseudocode block with time/space complexity analysis ($O(N \log N)$ vs $O(N^2)$).

#### 5. Experimental Setup & Benchmarks
- **4.1 Datasets & Evaluation Metrics**: Benchmark suites (GLUE, SQuAD 2.0), Top-1 Accuracy, F1-Score, FLOPS, Memory Footprint (VRAM).
- **4.2 Hardware & Environment**: 4× NVIDIA A100 (80GB SXM4), PyTorch 2.4, CUDA 12.4.
- **4.3 Baseline Comparisons**: Dense Baseline, LayerDrop, Sparse Transformer, PowerInfer.

#### 6. Results & Ablation Analysis
- **5.1 Quantitative Benchmarks Table**: Side-by-side comparison of Latency, Throughput (tokens/sec), and Accuracy.
- **5.2 Ablation Study**: Impact of pruning threshold $\tau$ and layer-wise selectivity.
- **5.3 Error Analysis & Edge Cases**: Failure modes on highly ambiguous inputs.

#### 7. Discussion & Limitations
- Hardware dependency on Tensor Core memory alignment; potential accuracy drop on domain shifts.

#### 8. Conclusion & Future Work
- Summary of efficiency breakthroughs and proposed extension to multi-modal vision-language models.

#### 9. References & Open Source Availability
- IEEE format references; link to reproducible GitHub repository and HuggingFace weights checkpoint.`;
  }

  if (isMed && !q.includes("every") && !q.includes("all")) {
    return `# 🏥 Sample Research Paper Layout: Medicine & Healthcare (ICMJE / CONSORT)

### Standard: CONSORT 2010 Guidelines / ICMJE Clinical Trial Format
**Target Venues**: The Lancet, NEJM, JAMA, BMJ, Nature Medicine.

---

### Complete Section-by-Section Blueprint:

#### 1. Title & Clinical Registration
- **Title**: *[Intervention, Condition, and Study Design]*
  *Example*: *"Efficacy and Safety of Monoclonal Antibody VX-402 in Adults with Refractory Rheumatoid Arthritis: A Double-Blind, Randomized, Placebo-Controlled Phase-3 Trial"*
- **Authors & Clinical Affiliations**: MD/PhD clinical investigators, Department of Rheumatology, Medical School / Teaching Hospital.
- **Trial Registration**: ClinicalTrials.gov Identifier (e.g., NCT04829103).

#### 2. Structured Abstract (Strict 250–300 words)
- **Background**: Clinical burden of biologic non-response in refractory patients.
- **Methods**: Double-blind, multi-center RCT ($N=640$), 1:1 randomization to VX-402 (150mg) vs. matching placebo for 24 weeks.
- **Results**: ACR20 response rate achieved by 68.4% in treatment vs. 29.1% in placebo ($p < 0.001$, 95% CI [29.8, 48.7]).
- **Conclusion**: Statistically and clinically significant improvement in disease activity with manageable safety profile.

#### 3. Introduction
- Pathophysiology of the disease; current therapeutic ceiling; pharmacological rationale for target pathway; study objective.

#### 4. Methods
- **Study Design & Setting**: Multi-center tertiary hospital clinical trial protocol.
- **Participant Eligibility Criteria**: Inclusion criteria (age 18–70, confirmed diagnosis $\ge 12$ months); Exclusion criteria (active infection, renal failure).
- **Randomization & Blinding**: Central computer-generated permuted block randomization; double-blind masking of patient and clinicians.
- **Ethical Approval & Informed Consent**: Institutional Review Board (IRB) approval; compliant with the Declaration of Helsinki.
- **Primary & Secondary Endpoints**: Primary (ACR20 at week 24); Secondary (DAS28-CRP remission, radiographic progression score).
- **Statistical Analysis Plan**: Sample size power calculation ($\alpha = 0.05, 1-\beta = 0.90$); Intent-to-Treat (ITT) population; Kaplan-Meier analysis.

#### 5. Results
- **Participant Flow Diagram**: CONSORT flowchart (Enrolled $\rightarrow$ Randomized $\rightarrow$ Allocated $\rightarrow$ Completed $\rightarrow$ Analyzed).
- **Table 1: Baseline Demographic & Clinical Characteristics**.
- **Table 2: Primary & Secondary Outcome Measures** with Odds Ratios (OR) and 95% Confidence Intervals.
- **Table 3: Treatment-Emergent Adverse Events (TEAEs)** & Safety Profile.

#### 6. Discussion
- Translation of clinical findings into clinical practice; comparison with TNF-alpha inhibitors; biological mechanism.

#### 7. Study Limitations
- 24-week observational window (necessitates long-term extension data); underrepresentation of elderly cohorts.

#### 8. Conclusion & Clinical Recommendations
- Summary of therapeutic utility and recommended Phase-4 post-market surveillance.

#### 9. Disclosures & References
- Conflict of interest declarations; funding source disclosure; Vancouver style numbered citations.`;
  }

  // Universal Layout covering EVERY sector
  return `# 📚 Complete Research Paper Layouts for Every Sector

Below is the universal structural standard for peer-reviewed academic papers, followed by the **authoritative publication layout blueprints for all 6 major sectors**.

---

## 🏛️ Universal Academic Research Paper Spine (Core Standard)

| Section | Core Purpose & Content | Standard Length |
| :--- | :--- | :--- |
| **Title & Affiliations** | Precise, searchable, informative; author names, institutions, contact email | 10–18 words |
| **Abstract & Keywords** | Standalone summary: Context, Problem, Methodology, Key Results, Significance | 150–250 words |
| **1. Introduction** | Problem definition, research motivation, research questions, and contributions | 10–15% of paper |
| **2. Literature Review** | Historical baseline, related work taxonomy, and explicit research gap | 15–20% of paper |
| **3. Methodology / Model** | Formal formulation, system architecture, clinical protocol, or experimental design | 25–30% of paper |
| **4. Results & Findings** | Empirical validation, tables, statistical tests, benchmarks, ablation studies | 20–25% of paper |
| **5. Discussion** | Interpretation of findings, theoretical/practical impact, comparison with prior art | 10–15% of paper |
| **6. Limitations** | Constraints, assumptions, threats to internal/external validity | 1–2 paragraphs |
| **7. Conclusion & Future Work** | Summary of core takeaways and recommended future research horizons | 1–2 paragraphs |
| **8. References** | Complete, standardized academic citations (IEEE, APA, Vancouver, or Nature) | 25–60 sources |

---

## 💻 1. Computer Science, AI & Software Engineering
- **Publishing Standard**: IEEE Transactions / ACM Conference Format (2-Column).
- **Key Venues**: NeurIPS, ICML, CVPR, IEEE TPAMI, ACM SIGCOMM, ACL.
- **Layout Blueprint**:
  1. **Title**: Action-driven or mechanism-driven (*"SystemName: Technique for Benchmark Task"*).
  2. **Abstract & Keywords**: Algorithmic innovation, speedup/accuracy metrics, 4–6 keywords (e.g., *Deep Learning, Transformer Pruning, Inference Latency*).
  3. **1. Introduction**: Compute bottlenecks, concrete contributions list (bullet points).
  4. **2. Related Work**: Prior algorithmic baselines and theoretical differentiation.
  5. **3. Proposed System Architecture**: Mathematical formulation ($X \in \mathbb{R}^{B \times L \times D}$), pipeline architecture diagram, and formal pseudocode algorithm.
  6. **4. Experimental Setup**: Datasets (ImageNet, GLUE), hardware specs (NVIDIA A100), baselines, and evaluation metrics (FLOPS, Latency, VRAM, F1).
  7. **5. Results & Ablation Studies**: Empirical benchmark comparison tables, parameter sensitivity curves, component ablation.
  8. **6. Limitations & Ethics**: Hardware dependencies, edge-case failures, compute carbon footprint.
  9. **7. Conclusion & Code Availability**: Summary of improvements; link to open-source repository.

---

## 🏥 2. Medicine, Healthcare & Clinical Sciences
- **Publishing Standard**: CONSORT 2010 Guidelines / ICMJE Clinical Trial Format.
- **Key Venues**: The Lancet, NEJM, JAMA, BMJ, Nature Medicine.
- **Layout Blueprint**:
  1. **Title**: Must specify intervention, target disease, and study design (*"Efficacy of Drug X in Condition Y: A Phase-3 Randomized Controlled Trial"*).
  2. **Structured Abstract**: Strict 4-subheading format: **Background**, **Methods**, **Results**, **Conclusions** + ClinicalTrials.gov ID.
  3. **1. Introduction**: Epidemiological burden, therapeutic gap, pharmacological hypothesis.
  4. **2. Methods**:
     - *Study Setting & Eligibility*: Inclusion and exclusion criteria.
     - *Randomization & Blinding*: Double-blind, permuted block allocation.
     - *Ethical Review*: Institutional Review Board (IRB) approval; Declaration of Helsinki compliance.
     - *Endpoints*: Primary efficacy outcome; Secondary biomarker responses.
     - *Statistical Analysis*: Power calculation ($\alpha = 0.05, 1-\beta = 0.90$), Intent-to-Treat (ITT), Kaplan-Meier curves, Hazard Ratios (HR).
  5. **3. Results**: CONSORT participant flow diagram, Table 1 (demographics), Table 2 (outcomes with 95% CIs), Adverse Events & Safety Profile.
  6. **4. Discussion**: Mechanism of therapeutic action, clinical practice translation, comparison with standard of care.
  7. **5. Limitations & Future Surveillance**: Follow-up horizon, demographic constraints.
  8. **6. References**: NLM / Vancouver numbered citations.

---

## ⚡ 3. Engineering & Physical Sciences (Mechanical, Electrical, Physics)
- **Publishing Standard**: IEEE / ASME / Applied Physics (AIP) Format.
- **Key Venues**: Journal of Applied Physics, IEEE Transactions on Power Systems, ASME Journal of Heat Transfer.
- **Layout Blueprint**:
  1. **Title**: Phenomenon + Engineering Application (*"Thermal Dissipation and Stress Resilience in Additively Manufactured Lattice Structures"*).
  2. **Abstract**: Mechanical/electromagnetic problem, prototype specs, physical testing data.
  3. **1. Introduction & Physics Rationale**: Failure modes, theoretical background, design objectives.
  4. **2. Governing Equations & Numerical Simulation**: Navier-Stokes / Maxwell's equations / FEA boundary conditions, mesh convergence test.
  5. **3. Experimental Setup & Fabrication**: CAD model, material composition, instrumentation (thermocouples, laser sensors, oscilloscopes), calibration.
  6. **4. Parametric Analysis & Experimental Data**: Stress-strain curves, signal-to-noise ratio (SNR), thermal impedance plots, uncertainty error propagation ($u_c$).
  7. **5. Comparative Discussion**: Simulation vs. physical sensor validation, manufacturing tolerances.
  8. **6. Conclusion**: Quantitative engineering performance metrics and commercial viability.

---

## 📊 4. Business, Finance & Management Economics
- **Publishing Standard**: Harvard / Elsevier / Journal of Finance Empirical Format.
- **Key Venues**: Journal of Financial Economics, Harvard Business Review, Strategic Management Journal.
- **Layout Blueprint**:
  1. **Title**: Empirical or strategic relationship (*"The Impact of Corporate ESG Disclosure on Debt Financing Costs: Evidence from Global Bond Markets"*).
  2. **Executive Summary / Abstract**: Practical corporate context, econometric sample, empirical findings, managerial takeaways.
  3. **1. Introduction**: Market dilemma, regulatory shifts, research questions, economic stakes.
  4. **2. Theoretical Framework & Hypotheses**: Agency theory / stakeholder theory, formal hypotheses ($H_1, H_2$).
  5. **3. Data & Econometric Methodology**:
     - *Sample Selection*: Panel dataset (e.g., 2,500 listed firms across 2015–2024).
     - *Variable Definitions*: Dependent (bond spreads), Independent (ESG ratings), Control variables (leverage, size, liquidity).
     - *Model Specification*: Fixed-effects panel regression / Difference-in-Differences (DiD).
  6. **4. Empirical Results**: Descriptive statistics table, correlation matrix, regression coefficients ($R^2$, $t$-stats), endogeneity robustness checks (Instrumental Variables).
  7. **5. Managerial & Policy Implications**: Strategic guidance for CFOs, investors, and regulators.
  8. **6. Conclusion & Limitations**: Data constraints in emerging markets; concluding recommendations.

---

## 🧠 5. Social Sciences, Psychology & Education
- **Publishing Standard**: American Psychological Association (APA 7th Edition).
- **Key Venues**: American Psychologist, Journal of Educational Psychology, Sociological Methods & Research.
- **Layout Blueprint**:
  1. **Title**: Behavioral construct & target population (*"Digital Learning Environments and Cognitive Load: A Longitudinal Study of Adolescent Metacognition"*).
  2. **Abstract**: Construct investigated, participant demographics, methodology, key findings, educational implications.
  3. **1. Introduction**: Social/behavioral context, psychological construct, study rationale.
  4. **2. Literature Review**: Theoretical framework (e.g., Cognitive Load Theory), identified empirical gaps.
  5. **3. Methodology**:
     - *Participants & Sampling*: $N=450$, stratified demographic breakdown, ethical parental consent.
     - *Measures & Instruments*: Validated psychometric scales (Likert scales), Cronbach's alpha reliability ($\alpha = 0.88$).
     - *Procedure*: Pre-test, experimental intervention, post-test timeline.
  6. **4. Findings (Quantitative & Qualitative)**: Repeated-measures ANOVA, effect sizes (Cohen's $d$, $\eta^2$), thematic interview coding.
  7. **5. Discussion**: Integration with cognitive psychology, classroom implications, curriculum reform.
  8. **6. Limitations & Conclusion**: Self-reporting bias, attrition rate; concluding pedagogical guidance.

---

## 🌿 6. Life Sciences, Biotechnology & Environmental Science
- **Publishing Standard**: Nature / Science / Frontiers IMRaD Format.
- **Key Venues**: Nature Biotechnology, Science of the Total Environment, Frontiers in Microbiology.
- **Layout Blueprint**:
  1. **Title**: Biological/environmental mechanism (*"Metagenomic Profiling of Microplastic-Degrading Bacterial Consortia in Deep-Sea Benthic Sediments"*).
  2. **Abstract**: Ecological dilemma, sequencing/biochemical assay, novel findings, bioremediation feasibility.
  3. **1. Introduction**: Environmental accumulation, biochemical degradation pathway, study objectives.
  4. **2. Materials and Methods**:
     - *Sampling Sites & Field Collection*: GPS coordinates, sediment core depth, environmental baseline controls.
     - *Assay Protocols & High-Throughput Sequencing*: Illumina/Nanopore metagenomics, enzyme assays, spectrophotometry.
     - *Bioinformatic & Statistical Pipelines*: Operational Taxonomic Units (OTU), Shannon diversity index, phylogenetic mapping.
  5. **3. Results**: Taxonomic abundance breakdown, biodegradation kinetics curves, identified enzyme gene clusters.
  6. **4. Discussion & Bioremediation Implications**: Biogeochemical impact, enzyme catalytic efficiency, scale-up feasibility.
  7. **5. Conclusion & Ethics**: Environmental safety compliance, genetic biosafety declaration.

---

### 💡 Pro-Tip for Veritas Users:
You can upload any research paper in **PDF, Word (.docx), PPTX, Markdown, or TXT** via the paperclip icon in the chat bar. Veritas will index every page and passage, extract the objectives, methodology, and limitations, and cross-examine any claim against the text with exact bracketed citations!`;
}
