# Extraction evaluation: litellm_2026-10-30_pdf

Decision models extract only the closed concepts (Boolean, label and rating concepts), without justifications and references: compare them with LLMs on the aspects and on the closed concepts.

| Case | Model | Mode | Runs | Aspect F1 | Concepts correct | Closed concepts correct | Reference F1 | Requests | Input tokens | Cached | Output tokens | Seconds | Retries |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| complex_mcu | anthropic/claude-sonnet-5-5 | default | 3 | 0.922 (0.885-0.943) | 25.7/26 (25-26) | 10.7/11 (10-11) | 0.780 (0.754-0.798) | 10 | 177,665 (174,579-179,485) | 0 | 10,732 (10,437-10,962) | 78 (76-80) | 0 |
| complex_mcu | openai/gpt-6.1-sol | default | 3 | 0.950 (0.938-0.956) | 26/26 | 11/11 | 0.767 (0.764-0.772) | 10 | 107,307 (106,611-108,559) | 47,001 (13,670-72,427) | 6,726 (6,183-7,527) | 122 (112-142) | 0 |
| complex_stability | anthropic/claude-sonnet-5-5 | default | 3 | 0.990 | 15.7/16 (15-16) | 5/5 | 0.897 (0.887-0.911) | 7 | 99,896 (99,738-100,072) | 0 | 5,189 (4,806-5,715) | 40 (37-43) | 0 |
| complex_stability | openai/gpt-6.1-sol | default | 3 | 0.984 | 15/16 | 5/5 | 0.897 (0.895-0.900) | 7 | 62,724 | 44,536 (8,202-62,703) | 2,773 (2,648-2,912) | 61 (56-70) | 0 |

## Cost

| Part | Files | Requests | Cost (USD) |
|---|---|---|---|
| Runs | 12 | 102 | 3.0440 |
| Total | | | 3.0440 |

## Concepts missed

- **complex_mcu, anthropic/claude-sonnet-5-5, default** (3 runs): Errata applicable to the DR-115 boards (LabelConcept): 1x
- **complex_stability, anthropic/claude-sonnet-5-5, default** (3 runs): Number of results outside the shelf-life specification (NumericalConcept): 1x
- **complex_stability, openai/gpt-6.1-sol, default** (3 runs): Water content of V20-2604 after 12 months at the long-term condition in % (NumericalConcept): 3x

## Aspects (mean F1, precision and recall of each aspect)

- **complex_mcu, anthropic/claude-sonnet-5-5, default**: Device limitations of revision C: F1 1.00 (P 1.00, R 1.00); Flash memory specifications: F1 0.98 (P 0.96, R 1.00); DR-114 clock configuration: F1 0.88 (P 0.89, R 0.88); DR-114 thermal assessment: F1 0.82 (P 0.70, R 1.00); DR-114 errata and firmware: F1 0.93 (P 0.94, R 0.92); DR-115 errata and PLL1 limits: F1 0.84 (P 0.92, R 0.79); Revision B end of life: F1 1.00 (P 1.00, R 1.00)
- **complex_mcu, openai/gpt-6.1-sol, default**: Device limitations of revision C: F1 1.00 (P 1.00, R 1.00); Flash memory specifications: F1 0.97 (P 0.93, R 1.00); DR-114 clock configuration: F1 0.90 (P 0.93, R 0.88); DR-114 thermal assessment: F1 0.98 (P 0.95, R 1.00); DR-114 errata and firmware: F1 0.91 (P 0.83, R 1.00); DR-115 errata and PLL1 limits: F1 0.90 (P 0.82, R 1.00); Revision B end of life: F1 1.00 (P 1.00, R 1.00)
- **complex_stability, anthropic/claude-sonnet-5-5, default**: Shelf-life acceptance criteria: F1 1.00 (P 1.00, R 1.00); Stability results of V20-2604: F1 1.00 (P 1.00, R 1.00); Results outside the shelf-life specification: F1 0.96 (P 1.00, R 0.92); Shelf-life rules and proposal: F1 1.00 (P 1.00, R 1.00)
- **complex_stability, openai/gpt-6.1-sol, default**: Shelf-life acceptance criteria: F1 1.00 (P 1.00, R 1.00); Stability results of V20-2604: F1 0.98 (P 0.95, R 1.00); Results outside the shelf-life specification: F1 0.96 (P 1.00, R 0.92); Shelf-life rules and proposal: F1 1.00 (P 1.00, R 1.00)

## Errors and warnings

- none
