use calamine::{open_workbook_auto_from_rs, Reader, Data};
use std::fs::File;
use std::io::Cursor;

fn main() {
    let bytes = std::fs::read("../test-data/horarios_prueba.xlsx").unwrap();
    let mut workbook = open_workbook_auto_from_rs(Cursor::new(bytes)).unwrap();
    let sheet = workbook.sheet_names()[0].clone();
    let range = workbook.worksheet_range(&sheet).unwrap();
    for (i, row) in range.rows().take(3).enumerate() {
        println!("Row {}:", i);
        for cell in row {
            if let Data::DateTime(dt) = cell {
                println!("  DateTime {:?}", dt);
            } else if let Data::Float(f) = cell {
                println!("  Float {:?}", f);
            } else if let Data::String(s) = cell {
                println!("  String {:?}", s);
            } else {
                println!("  Other");
            }
        }
    }
}
