function checkQuiz(blockId){
  const root = document.getElementById(`quiz-${blockId}`);
  if(!root) return;
  const questions = root.querySelectorAll("[data-q]");
  let correct = 0;
  questions.forEach(qEl=>{
    const ans = qEl.getAttribute("data-answer");
    const checked = qEl.querySelector("input[type=radio]:checked");
    const feedback = qEl.querySelector(".feedback");
    if(!checked){
      feedback.textContent = "Choose an answer.";
      feedback.style.opacity = 0.9;
      return;
    }
    if(checked.value === ans){
      correct += 1;
      feedback.textContent = "✅ Correct";
      feedback.style.opacity = 0.95;
    } else {
      feedback.textContent = "❌ Not correct";
      feedback.style.opacity = 0.95;
    }
  });
  const summary = root.querySelector(".summary");
  if(summary) summary.textContent = `Score: ${correct} / ${questions.length}`;
}
