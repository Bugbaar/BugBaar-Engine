from langchain_core.tools import tool


@tool
def calculator(first_num: float, second_num: float, operation: str) -> dict:
    """Perform add, sub, mul, or div on two numbers."""
    if operation == "add":
        result = first_num + second_num
    elif operation == "sub":
        result = first_num - second_num
    elif operation == "mul":
        result = first_num * second_num
    elif operation == "div":
        result = first_num / second_num
    else:
        return {"error": f"Unsupported operation '{operation}'"}
    return {"result": result}