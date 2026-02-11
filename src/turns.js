
// Stores the states of rules and turns
export const turns = {
    currentTurn: 1,
    currentPlayer: "white",
    currentRules: [],
    newRuleChoices: [],
};

// A turn has been made! Update our turn info
export const incrementTurn = () => {
    // TODO - update the core turn items
    //      Includes updating the time-life counter on all the current rules, removing them from list as if necessary
    // Send our updated rules state to the server
}

// This is used if we need to undo the effects of a turn
// e.g. if there's a double-turn rule in play, or just if someone made a mistake
// This does not change the piece states, it just changes turn/rules
export const undoTurn = () => {
    // TODO - implement
}

