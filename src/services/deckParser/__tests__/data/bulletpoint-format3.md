#### **Karte 5: Teilraumtopologie (Spurtopologie)**

* **Vorderseite:** Sei $(X, \mathcal{T})$ ein topologischer Raum und $Y \subseteq X$ eine beliebige Teilmenge. Wie wird $Y$ auf natürliche Weise selbst zu einem topologischen Raum (und warum ist das für Mannigfaltigkeiten im $\mathbb{R}^n$ wichtig)?
* **Rückseite:**
* **Definition:** Die **Teilraumtopologie** (oder *induzierte Topologie* / *Spurtopologie*) $\mathcal{T}_Y$ auf $Y$ ist definiert durch:

$$\mathcal{T}_Y := \{ O \cap Y \mid O \in \mathcal{T} \}$$

Eine Teilmenge $U \subseteq Y$ ist also genau dann offen in $Y$, wenn sie sich als Schnitt einer in $X$ offenen Menge $O$ mit $Y$ schreiben lässt.
* **Bedeutung für Mannigfaltigkeiten:** Wenn eine Teilmenge $M \subset \mathbb{R}^n$ (z. B. eine Kugeloberfläche im $\mathbb{R}^3$) als Mannigfaltigkeit betrachtet wird, trägt sie genau diese Teilraumtopologie des $\mathbb{R}^n$. Dadurch vererbt der $\mathbb{R}^n$ die Hausdorff-Eigenschaft und das zweite Abzählbarkeitsaxiom automatisch an jede seiner Teilmengen $M$!



---

#### **Karte 6: Untermannigfaltigkeit (Submanifold) & Karte / Parametrisierung**

* **Vorderseite:** Was ist eine $d$-dimensionale **Untermannigfaltigkeit** $M$ des $\mathbb{R}^n$ ($d \le n$) und wie hängen *Karte* ($\varphi$) und *Parametrisierung* ($\psi = \varphi^{-1}$) mit dem Machine Learning zusammen?
* **Rückseite:**
* **Definition:** Eine Teilmenge $M \subseteq \mathbb{R}^n$ (versehen mit der Teilraumtopologie) ist eine $d$-dimensionale topologische Untermannigfaltigkeit, wenn jeder Punkt $x \in M$ eine in $M$ offene Umgebung $U \subseteq M$ besitzt, die homöomorph zu einer offenen Menge $V \subseteq \mathbb{R}^d$ ist (für glatte Untermannigfaltigkeiten fordert man zusätzlich reguläre Differenzierbarkeit, z. B. vollen Rang der Jacobi-Matrix).
* **Übersetzung ins Machine Learning (Autoencoder / Latent Space):**
* **Karte (Chart) $\varphi: U \to V \subseteq \mathbb{R}^d$:** Bildet den hochdimensionalen Punkt $x \in \mathbb{R}^n$ auf seine $d$ intrinsischen Koordinaten (Freiheitsgrade) ab $\rightarrow$ entspricht im ML dem **Encoder** $h = f(x)$ (Dimensionsreduktion in den *Latent Space*).
* **Lokale Parametrisierung $\psi = \varphi^{-1}: V \to U \subseteq \mathbb{R}^n$:** Bildet die $d$ Freiheitsgrade zurück in den hochdimensionalen Merkmalsraum ab $\rightarrow$ entspricht im ML dem **Decoder** $\hat{x} = g(h)$ (Generierung / Einbettung in den *Ambient Space*).





---

#### **Karte 7: Mannigfaltigkeit in der Mathematik vs. Machine Learning (Manifold Hypothesis)**

* **Vorderseite:** Worin unterscheidet sich der strenge mathematische Begriff der Mannigfaltigkeit von der loseren Verwendung im Machine Learning (nach Goodfellow et al.), und was besagt die **Manifold Hypothesis**?
* **Rückseite:**
* **Begriffsverwendung im ML:**
1. Wenn im ML von „Manifold“ gesprochen wird, ist fast immer eine in den Merkmalsraum $\mathbb{R}^n$ eingebettete **Untermannigfaltigkeit** $M \subset \mathbb{R}^n$ der Dimension $d \ll n$ gemeint.
2. **Gelockerte Definition:** Im ML lässt man oft zu, dass sich $M$ selbst schneidet (z. B. eine „8“-Kurve) oder die lokale Dimension an einzelnen Punkten variiert (streng mathematisch sind das *Immersionen* oder *Varietäten*, keine Mannigfaltigkeiten).


* **Manifold Hypothesis:** Hochdimensionale reale Daten (Bilder, Audio, Text im $\mathbb{R}^n$) füllen den Raum $\mathbb{R}^n$ nicht gleichmäßig aus, sondern ihre Wahrscheinlichkeitsmasse konzentriert sich auf (oder extrem nahe an) einer niederdimensionalen Untermannigfaltigkeit $M$ der Dimension $d \ll n$, wobei $d$ der Anzahl der unabhängigen Erzeugungsfaktoren (*Degrees of Freedom*, z. B. Rotation, Translation, Beleuchtung) entspricht.