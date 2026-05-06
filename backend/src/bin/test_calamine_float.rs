use calamine::{Data, ExcelDateTime, ExcelDateTimeType};
fn main() {
    let dt = Data::DateTime(calamine::ExcelDateTime::new(0.333333333, ExcelDateTimeType::Time, false));
    println!("to_string: {}", dt.to_string());
}
