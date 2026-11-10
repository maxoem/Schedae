### Karte 1: Topologischer Raum / Topologie

**Vorderseite:**
Was ist eine **Topologie** $\mathcal{T}$ auf einer Menge $X$, was versteht man unter einem **topologischen Raum** $(X, \mathcal{T})$ und wie heißen die Elemente von $\mathcal{T}$?

**Rückseite:**
Sei $X$ eine Menge, $\mathcal{P}(X)$ die Potenzmenge von $X$ und $\mathcal{T} \subseteq \mathcal{P}(X)$ ein Mengensystem (eine Kollektion von Teilmengen).
$\mathcal{T}$ heißt **Topologie** auf $X$, wenn die folgenden drei Axiome erfüllt sind (wodurch definiert wird, was „offene Mengen“ sind):

1. **Leere Menge und Gesamtmenge:** $\emptyset, X \in \mathcal{T}$


2. **Abgeschlossenheit unter endlichen Schnitten:** $A, B \in \mathcal{T} \implies A \cap B \in \mathcal{T}$


3. **Abgeschlossenheit unter beliebigen Vereinigungen:** Für eine Familie $(A_i)_{i \in I}$ mit $A_i \in \mathcal{T}$ gilt $\bigcup_{i \in I} A_i \in \mathcal{T}$



**Weitere Begriffe:**

* **Offene Mengen:** Die Elemente von $\mathcal{T}$ heißen *offene Mengen* (open sets).


* **Topologischer Raum:** Das Paar $(X, \mathcal{T})$ wird als *topologischer Raum* bezeichnet.



---

### Karte 2: Metrischer Raum (und Zusammenhang zur Topologie)

**Vorderseite:**
Woraus besteht ein **metrischer Raum** $(X, d)$ und wie motiviert er den Begriff der offenen Mengen in der Topologie?

**Rückseite:**

* **Aufbau:** Ein metrischer Raum $(X, d)$ besteht aus einer Menge $X$ und einer Distanzfunktion (Metrik) $d$.


* **Nachbarschaft / Offene Mengen:** Man verwendet die Definition einer offenen Menge bzw. einer $\varepsilon$-Umgebung $B_\varepsilon(x)$ eines Punktes $x$ als Nachbarschaft.


* **Bezug zur Potenzmenge $\mathcal{P}(X)$:** Aus den Notizen: $\mathcal{P}(X)$ enthält die Menge aller offenen Mengen von $X$ sowie deren Rekombinationen.



> **Mathematischer Hinweis zur Präzisierung deiner Notiz:**
> In deinen Notizen steht: *„$\mathcal{P}(X)$ ist somit ja auch die Menge aller offenen Mengen von $X$ wie auch deren Rekombinationen.“*
> Hier lohnt sich eine scharfe Trennung: $\mathcal{P}(X)$ ist die Potenzmenge, enthält also ausnahmslos *alle* möglichen Teilmengen von $X$ (auch die nicht-offenen). Die Menge aller offenen Mengen (die durch Vereinigungen von $\varepsilon$-Umgebungen entstehen) bildet die Topologie $\mathcal{T}$, und diese ist im Allgemeinen eine *echte Teilmenge* der Potenzmenge ($\mathcal{T} \subsetneq \mathcal{P}(X)$) – außer in dem Spezialfall der diskreten Topologie, in der tatsächlich jede Teilmenge als offen definiert wird ($\mathcal{T} = \mathcal{P}(X)$).
> 
> 

---

### Karte 3: Hausdorff-Raum

**Vorderseite:**
Wann heißt ein topologischer Raum $(X, \mathcal{T})$ **Hausdorff-Raum**?

**Rückseite:**
Ein topologischer Raum $(X, \mathcal{T})$ heißt **Hausdorff-Raum**, wenn für alle Punkte $x, y \in X$ mit $x \neq y$ gilt:
Es existiert eine offene Umgebung $U_x \in \mathcal{T}$ von $x$ und eine offene Umgebung $U_y \in \mathcal{T}$ von $y$, sodass diese disjunkt sind:


$$U_x \cap U_y = \emptyset$$



*(Anschauung aus der Skizze: Zwei verschiedene Punkte $x$ und $y$ lassen sich stets durch zwei sich nicht schneidende offene „Blasen“ $U_x$ und $U_y$ voneinander trennen.)*

---

### Karte 4: (Topologische) Mannigfaltigkeit

**Vorderseite:**

1. Wann nennt man einen topologischen Raum $M$ eine **(topologische) Mannigfaltigkeit** der Dimension $n$ (kurz: $n$-Mannigfaltigkeit)?


2. Welche Eigenschaften erbt $M$, wann gelten zwei Mannigfaltigkeiten als gleich und welche Leitfragen stellen sich?



**Rückseite:**
**1. Definition:**
Sei $M$ ein topologischer Raum. $M$ heißt (topologische) Mannigfaltigkeit der Dimension $n$ (oder $n$-Mannigfaltigkeit), falls die folgenden drei Eigenschaften erfüllt sind:

1. **Hausdorff-Eigenschaft:** $M$ ist ein Hausdorff-Raum.


2. **Abzählbarkeit:** $M$ erfüllt das *zweite Abzählbarkeitsaxiom*.


3. **Lokal euklidisch:** Jeder Punkt besitzt eine Umgebung, welche *homöomorph* zu einer offenen Teilmenge des $\mathbb{R}^n$ ist.



**2. Eigenschaften & Klassifikation:**

* **Vererbte lokale Eigenschaften vom euklidischen Raum:** Mannigfaltigkeiten sind *lokal wegzusammenhängend*, *lokalkompakt* und *lokal metrisierbar*.


* **Äquivalenz & Klassifikation:** Mannigfaltigkeiten, die *homöomorph* zueinander sind, werden als gleich (bzw. äquivalent) angesehen. Daraus entstand die Frage nach der *Klassifikation*, also die Frage, wie viele nicht-äquivalente Mannigfaltigkeiten es gibt.


* **Weiterführende Leitfragen (aus den Kopfnotizen):**
* Ist eine Mannigfaltigkeit die Verallgemeinerung des Begriffes einer Fläche? *(Ja, eine Fläche ist der Spezialfall einer 2-dimensionalen Mannigfaltigkeit.)*


* Wann ist eine Mannigfaltigkeit differenzierbar (in den Notizen: „differenzierter“)? *(Wenn zusätzlich ein differenzierbarer Atlas existiert, sodass die Kartenwechselabbildungen zwischen den offenen Teilmengen des $\mathbb{R}^n$ beliebig oft differenzierbar sind.)*