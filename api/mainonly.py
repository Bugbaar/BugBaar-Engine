"""Entry point: plain terminal chat loop for the multi-tool agent."""
from dotenv import load_dotenv
from langchain_core.messages import HumanMessage
from langgraph.types import Command

load_dotenv()

from workflows.graph import workflow

config = {"configurable": {"thread_id": "1"}}


def run():
    
    print("BugBaar Engine - Multi-Tool Agent (type 'exit' to quit)")
    while True:
        user_input = input("You: ")
        if user_input.lower() in {"exit", "quit"}:
            break

        result = workflow.invoke({"messages": [HumanMessage(content=user_input)]}, config=config)

        # If a tool called interrupt() (e.g. purchase_stock), the graph pauses here
        if "__interrupt__" in result:
            approval_request = result["__interrupt__"][0].value
            print(f"Agent: {approval_request['reason']} (yes/no)")
            decision = input("You: ")
            result = workflow.invoke(Command(resume=decision), config=config)

        print(f"Agent: {result['messages'][-1].content}")


if __name__ == "__main__":
    run()