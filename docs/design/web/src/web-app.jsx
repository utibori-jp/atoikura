/* Atoikura Web App — navigation shell */

function App() {
  const [screen, setScreen] = React.useState(
    () => localStorage.getItem("atoikura-nav") || "home"
  );

  const navigate = React.useCallback((id) => {
    setScreen(id);
    localStorage.setItem("atoikura-nav", id);
    window.scrollTo(0, 0);
  }, []);

  // Expose globally so any screen component can trigger navigation
  window.AtoikuraNavigate = navigate;

  const screens = {
    home:      <AHomeScreen />,
    budget:    <ABudgetScreen />,
    review:    <AReviewScreen />,
    journal:   <AJournalScreen />,
    master:    <AMasterScreen />,
    recurring: <ARecurringScreen />,
    savings:   <ASavingsScreen />,
    income:    <AIncomeScreen />,
  };

  return screens[screen] || screens.home;
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
