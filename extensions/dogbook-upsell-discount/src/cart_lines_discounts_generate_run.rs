use super::schema;
use shopify_function::prelude::*;
use shopify_function::Result;

#[derive(Deserialize, Default, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
pub struct Configuration {
    discount_percent: f64,
    #[shopify_function(default)]
    variant_ids: Vec<String>,
}

#[shopify_function]
fn cart_lines_discounts_generate_run(
    input: schema::cart_lines_discounts_generate_run::Input,
) -> Result<schema::CartLinesDiscountsGenerateRunResult> {
    let has_product_discount_class = input
        .discount()
        .discount_classes()
        .contains(&schema::DiscountClass::Product);
    if !has_product_discount_class {
        return Ok(schema::CartLinesDiscountsGenerateRunResult { operations: vec![] });
    }

    let configuration: &Configuration = match input.discount().metafield() {
        Some(metafield) => metafield.json_value(),
        None => return Ok(schema::CartLinesDiscountsGenerateRunResult { operations: vec![] }),
    };
    if configuration.discount_percent <= 0.0 {
        return Ok(schema::CartLinesDiscountsGenerateRunResult { operations: vec![] });
    }

    // Two conditions: cart was built from the upsell flow (cart-level
    // attribute set by the permalink), AND the line's variant is in the
    // configured upsell list. Second check prevents the discount from
    // bleeding onto normal products the customer adds to the same cart
    // after clicking the email.
    let source_matches = match input.cart().attribute() {
        Some(a) => match a.value() {
            Some(v) => matches!(
                v.as_str(),
                "checkout" | "cart" | "order-status" | "order-confirmation"
            ),
            None => false,
        },
        None => false,
    };
    if !source_matches {
        return Ok(schema::CartLinesDiscountsGenerateRunResult { operations: vec![] });
    }
    if configuration.variant_ids.is_empty() {
        return Ok(schema::CartLinesDiscountsGenerateRunResult { operations: vec![] });
    }

    let targets: Vec<schema::ProductDiscountCandidateTarget> = input
        .cart()
        .lines()
        .iter()
        .filter(|l| match l.merchandise() {
            schema::cart_lines_discounts_generate_run::input::cart::lines::Merchandise::ProductVariant(v) => {
                configuration.variant_ids.iter().any(|id| id == v.id().as_str())
            }
            _ => false,
        })
        .map(|l| {
            schema::ProductDiscountCandidateTarget::CartLine(schema::CartLineTarget {
                id: l.id().clone(),
                quantity: None,
            })
        })
        .collect();

    if targets.is_empty() {
        return Ok(schema::CartLinesDiscountsGenerateRunResult { operations: vec![] });
    }

    Ok(schema::CartLinesDiscountsGenerateRunResult {
        operations: vec![schema::CartOperation::ProductDiscountsAdd(
            schema::ProductDiscountsAddOperation {
                selection_strategy: schema::ProductDiscountSelectionStrategy::First,
                candidates: vec![schema::ProductDiscountCandidate {
                    targets,
                    message: Some(format!(
                        "Dog Book upsell -{}%",
                        configuration.discount_percent as i32
                    )),
                    value: schema::ProductDiscountCandidateValue::Percentage(schema::Percentage {
                        value: Decimal(configuration.discount_percent),
                    }),
                    associated_discount_code: None,
                    prerequisites: None,
                }],
            },
        )],
    })
}
